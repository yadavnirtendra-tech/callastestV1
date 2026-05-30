// ============================================================
// Enterprise Calendar Sync — Periodic Sync Polling Service
// ============================================================
// Safety-net polling that catches any events missed by webhooks.
// On Railway, real webhooks handle most sync — this is a fallback.
// Runs every 5 minutes to avoid racing with webhook-triggered syncs
// (30-second polling caused duplicate events due to race conditions).
// ============================================================

import getDatabase from '../database/client';
import { addSyncJob } from '../queues/syncQueue';
import { syncLogger } from '../utils/logger';

let syncPollTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic sync polling service.
 * Runs every 5 minutes as a fallback behind real webhooks.
 */
export function startPeriodicSyncService(): void {
  syncLogger.info('Starting periodic sync polling service (5-minute interval)');

  // Trigger initial polling sync on startup (catches anything missed while server was down)
  pollAllActiveCalendars().catch(err =>
    syncLogger.error({ err }, 'Initial periodic sync polling check failed')
  );

  // Poll every 5 minutes — webhooks handle real-time sync on Railway.
  // DO NOT reduce this below 5 minutes: shorter intervals race with webhook-triggered
  // syncs and cause duplicate events on the target platform.
  const FIVE_MINUTES = 5 * 60 * 1000;
  syncPollTimer = setInterval(() => {
    pollAllActiveCalendars().catch(err =>
      syncLogger.error({ err }, 'Scheduled periodic sync polling failed')
    );
  }, FIVE_MINUTES);

  syncLogger.info('Periodic sync polling service running — checks every 5 minutes (webhooks handle real-time)');
}

/**
 * Stop the periodic sync service (called on server shutdown).
 */
export function stopPeriodicSyncService(): void {
  if (syncPollTimer) {
    clearInterval(syncPollTimer);
    syncPollTimer = null;
    syncLogger.info('Periodic sync polling service stopped');
  }
}

/**
 * Find all active, enabled calendars and trigger a sync job for each.
 */
async function pollAllActiveCalendars(): Promise<void> {
  const db = getDatabase();
  const activeCalendars = await db.calendar.findMany({
    where: { syncEnabled: true },
  });

  if (activeCalendars.length === 0) {
    syncLogger.debug('Periodic sync: no active calendars to poll');
    return;
  }

  syncLogger.info({ count: activeCalendars.length }, 'Periodic sync: queueing jobs for all active calendars');
  for (const calendar of activeCalendars) {
    addSyncJob(calendar.userId, calendar.id, calendar.provider).catch(err => {
      syncLogger.error(
        { userId: calendar.userId, calendarId: calendar.id, provider: calendar.provider, err },
        'Failed to queue periodic sync job'
      );
    });
  }
}
