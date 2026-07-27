// Radiantilyk EMR — BullMQ Base Worker & Queue Configuration
// Sets up the BullMQ queue infrastructure for background job processing.
// All 13 planned worker queues defined here with consistent configuration.
//
// Workers process: appointment reminders, scribe audio purge, lot expiry alerts,
// breach deadline tracking, PROM surveys, consent expiry, inventory alerts, etc.

import { Queue, Worker, QueueEvents } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// ---- Queue Names (13 planned queues) ----
export const QUEUE_NAMES = {
  APPOINTMENT_REMINDER: 'appointment-reminder',
  CONSENT_EXPIRY: 'consent-expiry',
  SCRIBE_AUDIO_PURGE: 'scribe-audio-purge',
  LOT_EXPIRY_ALERT: 'lot-expiry-alert',
  BREACH_DEADLINE: 'breach-deadline',
  PROM_SURVEY: 'prom-survey',
  POST_OP_CHECKIN: 'post-op-checkin',
  EMAIL_SEND: 'email-send',
  SMS_SEND: 'sms-send',
  INVOICE_GENERATION: 'invoice-generation',
  REPORT_GENERATION: 'report-generation',
  PHI_DELETION: 'phi-deletion',
  BACKUP_NOTIFICATION: 'backup-notification',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ---- Default Queue Options ----
const DEFAULT_QUEUE_OPTIONS = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // 5s initial, then 25s, then 125s
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 7 * 24 * 3600, // 7-day retention
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs for debugging
      age: 30 * 24 * 3600, // 30-day retention
    },
  },
};

// ---- Queue Factory ----
const queues = new Map<string, Queue>();

/**
 * Get or create a BullMQ Queue instance.
 */
export function getQueue(queueName: QueueName): Queue {
  if (queues.has(queueName)) {
    return queues.get(queueName)!;
  }

  const connection = getRedisClient();

  const queue = new Queue(queueName, {
    connection,
    ...DEFAULT_QUEUE_OPTIONS,
  });

  queues.set(queueName, queue);
  logger.info(`[QUEUE] Initialized queue: ${queueName}`);

  return queue;
}

/**
 * Create a BullMQ Worker for processing jobs.
 * Each worker gets its own Redis connection to avoid blocking.
 */
export function createWorker(
  queueName: QueueName,
  processor: (job: any) => Promise<void>,
  concurrency: number = 1
): Worker {
  const connection = getRedisClient();

  const worker = new Worker(queueName, processor, {
    connection,
    concurrency,
    limiter: {
      max: 10,
      duration: 1000, // Max 10 jobs per second
    },
  });

  worker.on('completed', (job) => {
    logger.info(`[WORKER] ${queueName} job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[WORKER] ${queueName} job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`[WORKER] ${queueName} error: ${err.message}`);
  });

  logger.info(`[WORKER] Started worker for queue: ${queueName} (concurrency: ${concurrency})`);

  return worker;
}

/**
 * Gracefully shutdown all queues and workers.
 */
export async function shutdownQueues(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [name, queue] of queues.entries()) {
    closePromises.push(
      queue.close().then(() => {
        logger.info(`[QUEUE] Closed queue: ${name}`);
      })
    );
  }

  await Promise.allSettled(closePromises);
  queues.clear();
}
