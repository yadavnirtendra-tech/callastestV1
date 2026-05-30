// ============================================================
// Enterprise Calendar Sync — Periodic Sync Polling Service
// ============================================================
// Periodically polls and synchronizes all active calendars.
// Acts as a fallback for webhook connection issues and domain
// validation requirements, running every 5 minutes.
// ============================================================

import getDatabase from '../database/client';
import { addSyncJob } from '../queues/syncQueue';
import { syncLogger } from '../utils/logger';

let syncPollTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic sync polling service.
 * Runs every 5 minutes.
 */
export function startPeriodicSyncService(): void {
  syncLogger.info('Starting periodic sync polling service');

  // Trigger initial polling sync on startup
  pollAllActiveCalendars().catch(err =>
    syncLogger.error({ err }, 'Initial periodic sync polling check failed')
  );

  // Poll every 30 seconds to provide near-instant sync for local dev without verified webhooks
  const POLLING_INTERVAL = 30 * 1000;
  syncPollTimer = setInterval(() => {
    pollAllActiveCalendars().catch(err =>
      syncLogger.error({ err }, 'Scheduled periodic sync polling failed')
    );
  }, POLLING_INTERVAL);

  syncLogger.info('Periodic sync polling service running — checks every 30 seconds');
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
