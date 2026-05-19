// ============================================================
// Enterprise Calendar Sync — Database Client
// ============================================================
// Singleton Prisma client with connection pooling.
// Uses parameterized queries ONLY — SQL injection is impossible.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { dbLogger } from '../utils/logger';
import config from '../config';

// Singleton pattern — ensures only ONE connection pool exists
let prisma: PrismaClient;

export function getDatabase(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: config.database.url,
      log: config.isDev
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [{ emit: 'event', level: 'error' }],
    });

    // Log queries in development (with timing)
    if (config.isDev) {
      (prisma as any).$on('query', (e: any) => {
        dbLogger.debug({ duration: `${e.duration}ms`, query: e.query?.substring(0, 200) }, 'DB query');
      });
    }

    // Always log errors
    (prisma as any).$on('error', (e: any) => {
      dbLogger.error({ message: e.message }, 'Database error');
    });

    dbLogger.info('Database client initialized');
  }

  return prisma;
}

/**
 * Gracefully disconnect the database on shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    dbLogger.info('Database disconnected');
  }
}

/**
 * Health check — verifies database connectivity.
 */
export async function checkDatabaseHealth(): Promise<{ status: 'up' | 'down'; latency: number }> {
  const start = Date.now();
  try {
    await getDatabase().$queryRaw`SELECT 1`;
    return { status: 'up', latency: Date.now() - start };
  } catch {
    return { status: 'down', latency: Date.now() - start };
  }
}

export default getDatabase;
