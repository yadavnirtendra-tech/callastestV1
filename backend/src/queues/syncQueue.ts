// ============================================================
// Enterprise Calendar Sync — Background Sync Queue (BullMQ)
// ============================================================
// Queues webhook events in Redis for reliable asynchronous execution.
// Supports exponential backoff, automatic retries, and rate limits.
// Automatically falls back to in-memory execution if Redis is not set up.
// ============================================================

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import config from '../config';
import { processSyncWebhook } from '../sync/orchestrator';
import logger, { syncLogger } from '../utils/logger';

let redisConnection: Redis | null = null;
let syncQueue: Queue | null = null;
let syncWorker: Worker | null = null;

/**
 * Returns an active Redis connection or null if not configured.
 */
export function getRedisConnection(): Redis | null {
  if (redisConnection) return redisConnection;

  const url = config.redis.url;
  const host = config.redis.host;

  // If REDIS_URL is not set and host is localhost, bypass Redis to avoid connection error loops.
  // The app will gracefully fall back to the in-memory queue.
  if (!url && host === 'localhost') {
    return null;
  }

  try {
    if (url) {
      redisConnection = new Redis(url, {
        maxRetriesPerRequest: null,
      });
    } else {
      redisConnection = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: null,
      });
    }

    redisConnection.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });

    return redisConnection;
  } catch (err) {
    logger.warn({ err }, 'Failed to initialize Redis connection — falling back to in-memory queueing');
    return null;
  }
}

/**
 * Initialize BullMQ queues and workers.
 */
export function initializeQueues(): void {
  const connection = getRedisConnection();
  if (!connection) {
    logger.info('Redis not available or skipped — running sync jobs in-memory');
    return;
  }

  try {
    syncQueue = new Queue('sync-jobs', { connection: connection as any });

    syncWorker = new Worker(
      'sync-jobs',
      async (job) => {
        const { userId, calendarId, provider } = job.data;
        syncLogger.info({ userId, calendarId, provider, jobId: job.id }, 'Processing sync job from queue');
        await processSyncWebhook(userId, calendarId, provider);
      },
      {
        connection: connection as any,
        concurrency: config.sync.maxConcurrentSyncs,
      }
    );

    syncWorker.on('completed', (job) => {
      syncLogger.debug({ jobId: job.id }, 'Sync job completed successfully');
    });

    syncWorker.on('failed', (job, err) => {
      syncLogger.error({ jobId: job?.id, err }, 'Sync job failed');
    });

    logger.info('BullMQ sync-jobs queue and worker initialized successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize BullMQ queues');
  }
}

// ---- Deduplication ----
// Prevents webhook + periodic poll from triggering duplicate sync jobs
// for the same calendar within a short window.
const recentSyncJobs = new Map<string, number>(); // key → timestamp
const DEDUP_WINDOW_MS = 10_000; // 10 seconds

/**
 * Add a sync job to the background queue or process immediately if Redis is offline.
 * Includes a 10-second deduplication window to prevent webhook + poll race conditions.
 */
export async function addSyncJob(userId: string, calendarId: string, provider: string): Promise<void> {
  // Deduplication: skip if the same calendar was synced within the last 10 seconds
  const dedupKey = `${userId}:${calendarId}`;
  const now = Date.now();
  const lastSync = recentSyncJobs.get(dedupKey);
  if (lastSync && (now - lastSync) < DEDUP_WINDOW_MS) {
    syncLogger.debug({ userId, calendarId, provider }, 'Sync job deduplicated — same calendar synced within 10s window');
    return;
  }
  recentSyncJobs.set(dedupKey, now);

  // Clean up old entries periodically (prevent memory leak)
  if (recentSyncJobs.size > 500) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [key, ts] of recentSyncJobs) {
      if (ts < cutoff) recentSyncJobs.delete(key);
    }
  }

  const connection = getRedisConnection();
  
  if (connection && syncQueue) {
    try {
      // Use a deterministic jobId so BullMQ also deduplicates at the queue level
      const jobId = `sync-${userId}-${calendarId}-${Math.floor(now / DEDUP_WINDOW_MS)}`;
      await syncQueue.add(
        'sync-event',
        { userId, calendarId, provider },
        {
          jobId, // BullMQ ignores duplicate jobIds that are still in the queue
          attempts: config.sync.maxRetries,
          backoff: {
            type: 'exponential',
            delay: config.sync.retryDelayMs,
          },
          removeOnComplete: true,
          removeOnFail: 100, // Keep last 100 failed jobs for debugging
        }
      );
      syncLogger.info({ userId, calendarId, provider }, 'Queued sync job in BullMQ');
      return;
    } catch (err) {
      syncLogger.warn({ userId, calendarId, provider, err }, 'Failed to queue job in Redis, falling back to in-memory processing');
    }
  }

  // Fallback to in-memory execution
  processSyncWebhook(userId, calendarId, provider as any).catch(err => {
    syncLogger.error({ userId, calendarId, provider, err }, 'In-memory sync processing failed');
  });
}

/**
 * Close background connections gracefully during server shutdown.
 */
export async function shutdownQueues(): Promise<void> {
  if (syncWorker) {
    await syncWorker.close();
  }
  if (syncQueue) {
    await syncQueue.close();
  }
  if (redisConnection) {
    await redisConnection.quit();
  }
  logger.info('BullMQ queue connections closed');
}
