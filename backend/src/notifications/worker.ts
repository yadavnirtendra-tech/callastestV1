// ============================================================
// Enterprise Calendar Sync — Notification Worker
// ============================================================
// Polls the notifications table every 30 seconds and sends
// any pending emails via the smart email router.
// ============================================================

import { getPendingNotifications, markNotificationSent } from './dispatcher';
import { sendRoutedEmail } from './emailRouter';
import { notificationLogger } from '../utils/logger';
import getDatabase from '../database/client';

let workerTimer: NodeJS.Timeout | null = null;

export function startNotificationWorker(): void {
  notificationLogger.info('Notification worker starting — polling every 30s');

  processQueue().catch(err =>
    notificationLogger.error({ err }, 'Initial notification processing failed')
  );

  workerTimer = setInterval(() => {
    processQueue().catch(err =>
      notificationLogger.error({ err }, 'Notification worker cycle failed')
    );
  }, 30_000);
}

export function stopNotificationWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    notificationLogger.info('Notification worker stopped');
  }
}

async function processQueue(): Promise<void> {
  const pending = await getPendingNotifications(50);
  if (pending.length === 0) return;

  notificationLogger.info({ count: pending.length }, 'Processing pending notifications');

  for (const notification of pending) {
    try {
      if (notification.channel === 'email') {
        const recipientEmail = notification.user?.email;
        if (!recipientEmail) {
          await failNotification(notification.id, 'No recipient email');
          continue;
        }

        const meta = notification.metadata as any;

        // Use smart router — picks Gmail API, MS Graph, or SendGrid
        // based on user preference + which platform the event came from
        await sendRoutedEmail({
          userId: notification.userId,
          to: recipientEmail,
          subject: notification.subject,
          html: notification.body,
          sourceProvider: meta?.sourceProvider as 'GOOGLE' | 'MICROSOFT' | undefined,
        });

        await markNotificationSent(notification.id);

        // Mark conflict log as notified
        if (meta?.conflictLogId) {
          const db = getDatabase();
          await db.conflictLog.update({
            where: { id: meta.conflictLogId },
            data: { notificationSent: true },
          }).catch(() => {});
        }
      }
    } catch (err) {
      notificationLogger.error(
        { notificationId: notification.id, err },
        'Failed to send notification'
      );
      await failNotification(notification.id, (err as Error).message);
    }
  }
}

async function failNotification(id: string, reason: string): Promise<void> {
  const db = getDatabase();
  await db.notification.update({
    where: { id },
    data: { status: 'failed', metadata: { failReason: reason } as any },
  }).catch(() => {});
}
