// Radiantilyk EMR — Redis Connection (Sessions, Cache, BullMQ)
// Single IORedis instance for session cache and BullMQ queue backbone.
// Graceful fallback in local development if Redis server is not running.

import Redis from 'ioredis';
import { env } from './env';

let redisClient: Redis | null = null;
let redisErrorLogged = false;

export function getRedisClient(): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    tls: env.REDIS_TLS_ENABLED ? {} : undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    lazyConnect: true, // Connect on demand
    retryStrategy: (times: number) => {
      // In development, stop retrying quickly after 2 attempts if Redis is not running
      if (!env.IS_PRODUCTION && times > 2) {
        return null;
      }
      if (times > 10) {
        return null; // Stop retrying
      }
      return Math.min(times * 200, 2000);
    },
  });

  redisClient.on('connect', () => {
    console.log('[REDIS] Connected ✅');
  });

  redisClient.on('error', (err) => {
    if (!redisErrorLogged) {
      console.warn('[REDIS WARNING] Local Redis server not running. Queues and session cache disabled.');
      redisErrorLogged = true;
    }
  });

  return redisClient;
}

/**
 * Verify Redis connectivity at startup.
 * Non-fatal — server starts without Redis but queues and sessions will be degraded.
 */
export async function verifyRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    await client.connect();
    const pong = await client.ping();
    if (pong === 'PONG') {
      console.log('[REDIS] Connection verified ✅');
      return true;
    }
    return false;
  } catch (error) {
    if (!redisErrorLogged) {
      console.warn('[REDIS WARNING] Redis not available. Running in standalone mode.');
      redisErrorLogged = true;
    }
    return false;
  }
}

/**
 * Graceful Redis disconnect.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      // Ignore disconnect errors if client was never connected
    }
    redisClient = null;
    console.log('[REDIS] Disconnected');
  }
}
