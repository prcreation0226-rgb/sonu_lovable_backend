// Radiantilyk EMR — Prisma Client Singleton
// Single PrismaClient instance shared across the application.
// Includes query logging in development and connection health check.

import { PrismaClient } from '@prisma/client';
import { env } from './env';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.IS_PRODUCTION
      ? ['error', 'warn']
      : ['query', 'info', 'warn', 'error'],
  });

if (!env.IS_PRODUCTION) {
  globalForPrisma.prisma = prisma;
}

/**
 * Verify database connectivity at startup.
 * Throws and prevents server start if connection fails.
 */
export async function verifyDatabaseConnection(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[DATABASE] MySQL connection verified ✅');
  } catch (error) {
    console.error('[DATABASE FATAL] Cannot connect to MySQL:', error);
    throw error;
  }
}

/**
 * Graceful shutdown — disconnect Prisma on SIGTERM/SIGINT.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('[DATABASE] MySQL disconnected');
}
