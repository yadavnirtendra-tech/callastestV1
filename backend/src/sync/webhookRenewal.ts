// ============================================================
// Enterprise Calendar Sync — Webhook Auto-Renewal Service
// ============================================================
// Google webhooks expire every 7 days.
// Microsoft webhooks expire every 3 days.
// This service runs on startup and then on a timer,
// renewing any subscription that expires within 24 hours.
// ============================================================

import getDatabase from '../database/client';
import { syncLogger } from '../utils/logger';
import { watchGoogleCalendar, stopGoogleWatch } from '../connectors/google/calendar';
import { createMicrosoftSubscription, renewMicrosoftSubscription } from '../connectors/microsoft/calendar';
import config from '../config';

let renewalTimer: NodeJS.Timeout | null = null;

/**
 * Start the webhook renewal service.
 * Runs immediately on boot, then every 6 hours.
 */
export function startWebhookRenewalService(): void {
  syncLogger.info('Starting webhook renewal service');

  // Run immediately on startup
  renewExpiringWebhooks().catch(err =>
    syncLogger.error({ err }, 'Initial webhook renewal check failed')
  );

  // Then run every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  renewalTimer = setInterval(() => {
    renewExpiringWebhooks().catch(err =>
      syncLogger.error({ err }, 'Scheduled webhook renewal failed')
    );
  }, SIX_HOURS);

  syncLogger.info('Webhook renewal service running — checks every 6 hours');
}

/**
 * Stop the renewal service (called on graceful shutdown).
 */
export function stopWebhookRenewalService(): void {
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
    syncLogger.info('Webhook renewal service stopped');
  }
}

/**
 * Find all subscriptions expiring within 24 hours and renew them.
 */
async function renewExpiringWebhooks(): Promise<void> {
  const db = getDatabase();
  const renewalThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now

  const expiring = await db.webhookSubscription.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: renewalThreshold },
    },
    include: {
      calendar: {
        include: { user: { select: { id: true, email: true } } },
      },
    },
  });

  if (expiring.length === 0) {
    syncLogger.info('Webhook renewal: no subscriptions expiring within 24h');
    return;
  }

  syncLogger.info({ count: expiring.length }, 'Webhook renewal: renewing expiring subscriptions');

  for (const sub of expiring) {
    try {
      if (sub.provider === 'GOOGLE') {
        await renewGoogleSubscription(sub);
      } else {
        await renewMicrosoftSubscriptionRecord(sub);
      }
    } catch (err) {
      syncLogger.error(
        { subscriptionId: sub.id, provider: sub.provider, err },
        'Failed to renew webhook subscription'
      );
      // Mark as failed so admin dashboard shows it
      await db.webhookSubscription.update({
        where: { id: sub.id },
        data: { status: 'EXPIRED' },
      }).catch(() => {});
    }
  }
}

/**
 * Google webhooks cannot be renewed — must be stopped and re-created.
 */
async function renewGoogleSubscription(sub: any): Promise<void> {
  const db = getDatabase();
  const userId = sub.calendar.user.id;
  const calendarId = sub.calendar.externalCalendarId;
  const webhookUrl = config.webhook.googleUrl || `${config.webhook.baseUrl}/webhooks/google`;

  syncLogger.info(
    { channelId: sub.channelId, userId },
    'Renewing Google webhook — stopping old and creating new'
  );

  // Stop the old channel (best-effort, ignore errors)
  try {
    await stopGoogleWatch(sub.channelId, sub.resourceId || '', userId);
  } catch {
    // Old subscription may already be expired — continue
  }

  // Create a new watch channel
  const newWatch = await watchGoogleCalendar(userId, calendarId, webhookUrl);

  // Update the DB record
  await db.webhookSubscription.update({
    where: { id: sub.id },
    data: {
      channelId: newWatch.channelId,
      resourceId: newWatch.resourceId,
      expiresAt: newWatch.expiration,
      status: 'ACTIVE',
    },
  });

  syncLogger.info(
    { newChannelId: newWatch.channelId, expiresAt: newWatch.expiration },
    'Google webhook renewed successfully'
  );
}

/**
 * Microsoft webhooks can be patched with a new expiration date.
 */
async function renewMicrosoftSubscriptionRecord(sub: any): Promise<void> {
  const db = getDatabase();
  const userId = sub.calendar.user.id;

  syncLogger.info(
    { subscriptionId: sub.channelId, userId },
    'Renewing Microsoft webhook subscription'
  );

  try {
    // Try to extend the existing subscription
    const newExpiration = await renewMicrosoftSubscription(userId, sub.channelId);

    await db.webhookSubscription.update({
      where: { id: sub.id },
      data: { expiresAt: newExpiration, status: 'ACTIVE' },
    });

    syncLogger.info(
      { subscriptionId: sub.channelId, newExpiration },
      'Microsoft webhook renewed successfully'
    );
  } catch {
    // Renewal failed — subscription may be gone, recreate it
    syncLogger.warn(
      { subscriptionId: sub.channelId },
      'Microsoft webhook renewal failed — recreating subscription'
    );

    const webhookUrl = config.webhook.microsoftUrl || `${config.webhook.baseUrl}/webhooks/microsoft`;
    const newSub = await createMicrosoftSubscription(
      userId,
      sub.calendar.externalCalendarId,
      webhookUrl
    );

    await db.webhookSubscription.update({
      where: { id: sub.id },
      data: {
        channelId: newSub.subscriptionId,
        expiresAt: newSub.expiration,
        status: 'ACTIVE',
      },
    });

    syncLogger.info(
      { newSubscriptionId: newSub.subscriptionId },
      'Microsoft webhook recreated successfully'
    );
  }
}
