// ============================================================
// Enterprise Calendar Sync — Notification Worker
// ============================================================
// Polls the notifications table every 30 seconds and sends
// any pending emails. Marks them sent or failed.
// ============================================================

import { getPendingNotifications, markNotificationSent } from './dispatcher';
import { sendEmail } from './emailSender';
import { notificationLogger } from '../utils/logger';
import getDatabase from '../database/client';

let workerTimer: NodeJS.Timeout | null = null;

export function startNotificationWorker(): void {
  notificationLogger.info('Notification worker starting — polling every 30s');

  // Run immediately on boot
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

        await sendEmail({
          to: recipientEmail,
          subject: notification.subject,
          html: notification.body,
        });

        await markNotificationSent(notification.id);

        // If this was a conflict rejection, mark the conflict log as notified
        const meta = notification.metadata as any;
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
