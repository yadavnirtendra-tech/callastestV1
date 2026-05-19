// ============================================================
// Enterprise Calendar Sync — Notification Dispatcher
// ============================================================

import getDatabase from '../database/client';
import { notificationLogger } from '../utils/logger';

interface NotificationParams {
  userId: string;
  type: string;
  channel: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/**
 * Queue a notification for delivery.
 * Notifications are stored in the database and processed by the notification worker.
 */
export async function queueNotification(params: NotificationParams): Promise<string> {
  const db = getDatabase();

  const notification = await db.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      channel: params.channel,
      subject: params.subject,
      body: params.body,
      status: 'pending',
      metadata: (params.metadata as any) || {},
    },
  });

  notificationLogger.info({
    notificationId: notification.id,
    type: params.type,
    channel: params.channel,
  }, 'Notification queued');

  return notification.id;
}

/**
 * Mark a notification as sent.
 */
export async function markNotificationSent(notificationId: string): Promise<void> {
  const db = getDatabase();
  await db.notification.update({
    where: { id: notificationId },
    data: { status: 'sent', sentAt: new Date() },
  });
}

/**
 * Get pending notifications for processing.
 */
export async function getPendingNotifications(limit: number = 50) {
  const db = getDatabase();
  return db.notification.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { user: true },
  });
}
