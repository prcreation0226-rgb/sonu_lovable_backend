// Radiantilyk EMR — Server Entry Point
// Starts the Express server with graceful shutdown and dependency health checks.
// Sequence: Validate env → Connect DB → Connect Redis → Start HTTP → Listen.

import app from './app';
import { env } from './config/env';
import { verifyDatabaseConnection, disconnectDatabase } from './config/database';
import { verifyRedisConnection, disconnectRedis } from './config/redis';
import { shutdownQueues } from './services/queue.service';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  logger.info('========================================');
  logger.info('  Radiantilyk Aesthetic EMR Backend');
  logger.info(`  Environment: ${env.NODE_ENV}`);
  logger.info(`  Port: ${env.PORT}`);
  logger.info('========================================');

  // ---- Step 1: Verify Database Connection ----
  try {
    await verifyDatabaseConnection();
  } catch (error) {
    logger.error('[STARTUP FATAL] Database connection failed. Exiting.');
    process.exit(1);
  }

  // ---- Step 2: Verify Redis Connection (non-fatal) ----
  const redisAvailable = await verifyRedisConnection();
  if (!redisAvailable) {
    logger.warn('[STARTUP] Redis not available. BullMQ queues and session cache disabled.');
  }

  // ---- Step 3: Start HTTP Server ----
  const server = app.listen(env.PORT, () => {
    logger.info(`[SERVER] Listening on http://localhost:${env.PORT}`);
    logger.info(`[SERVER] Health check: http://localhost:${env.PORT}/health`);
    logger.info(`[SERVER] API prefix: ${env.API_PREFIX}`);
    logger.info('[SERVER] Ready to accept requests ✅');
  });

  // ---- Graceful Shutdown ----
  const gracefulShutdown = async (signal: string) => {
    logger.info(`[SHUTDOWN] Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async () => {
      logger.info('[SHUTDOWN] HTTP server closed');

      try {
        // Drain queues
        await shutdownQueues();
        logger.info('[SHUTDOWN] BullMQ queues drained');

        // Disconnect Redis
        await disconnectRedis();

        // Disconnect Database
        await disconnectDatabase();

        logger.info('[SHUTDOWN] Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('[SHUTDOWN] Error during graceful shutdown:', { error });
        process.exit(1);
      }
    });

    // Force exit after 30 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('[SHUTDOWN] Forced exit after 30s timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // ---- Uncaught Error Handlers ----
  process.on('uncaughtException', (error) => {
    logger.error('[UNCAUGHT EXCEPTION]', { error: error.message, stack: error.stack });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[UNHANDLED REJECTION]', { reason });
    // Do NOT exit — log and continue for non-critical promise rejections
  });
}

bootstrap().catch((error) => {
  console.error('[BOOTSTRAP FATAL]', error);
  process.exit(1);
});
