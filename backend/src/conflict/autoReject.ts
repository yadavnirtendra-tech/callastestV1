// ============================================================
// Enterprise Calendar Sync — Auto-Rejection Workflow
// ============================================================
// Automatically declines conflicting meeting invites and
// sends professional rejection emails.
// ============================================================

import getDatabase from '../database/client';
import { conflictLogger } from '../utils/logger';
import { getAvailableSlots } from './detector';
import { logAuditEvent } from '../audit/logger';
import { queueNotification } from '../notifications/dispatcher';
import { CanonicalEvent, ConflictDetectionResult, AuditAction, AuditResourceType, AuditSource } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Handle automatic rejection of a conflicting event.
 */
export async function handleAutoRejection(
  userId: string,
  event: Partial<CanonicalEvent>,
  conflictResult: ConflictDetectionResult,
  calendar: any,
  idempotencyKey: string
): Promise<void> {
  const db = getDatabase();

  try {
    // 1. Record conflict in database
    if (!conflictResult.conflicts.length) {
      conflictLogger.warn({ userId }, 'handleAutoRejection called with empty conflicts array — skipping');
      return;
    }
    const mainConflict = conflictResult.conflicts[0];

    // Validate eventId — synthetic IDs like 'google-busy', 'microsoft-busy', 'incoming'
    // are NOT real DB UUIDs and would cause an FK constraint violation.
    const SYNTHETIC_IDS = new Set(['incoming', 'google-busy', 'microsoft-busy']);
    const rawEventId = mainConflict.existingEvent?.eventId;
    const safeEventId = (rawEventId && !SYNTHETIC_IDS.has(rawEventId)) ? rawEventId : uuidv4();

    await db.conflictLog.create({
      data: {
        eventId: safeEventId,
        userId,
        conflictType: mainConflict?.type?.toUpperCase() as any || 'TIME_OVERLAP',
        resolution: 'AUTO_REJECTED',
        conflictingEventData: {
          incomingTitle: event.title,
          incomingStart: event.startTime,
          incomingEnd: event.endTime,
          incomingOrganizer: event.organizerEmail,
          syntheticId: SYNTHETIC_IDS.has(rawEventId || '') ? rawEventId : undefined,
          conflicts: conflictResult.conflicts.map(c => ({
            existingTitle: c.existingEvent.title,
            existingStart: c.existingEvent.startTime,
            existingEnd: c.existingEvent.endTime,
            overlapMinutes: c.overlapMinutes,
          })),
        },
        rejectionReason: buildRejectionReason(conflictResult),
        notificationSent: false,
      },
    });

    // Fetch up to 3 upcoming free slots to suggest in the rejection email
    const freeSlots = await getAvailableSlots(userId);

    // 2. Queue rejection email
    await queueNotification({
      userId,
      type: 'rejection',
      channel: 'email',
      subject: `Meeting Declined: ${event.title || 'Untitled Event'}`,
      body: buildRejectionEmailBody(event, conflictResult, freeSlots),
      metadata: {
        eventTitle: event.title,
        organizerEmail: event.organizerEmail,
        startTime: event.startTime,
        endTime: event.endTime,
        conflictCount: conflictResult.conflicts.length,
        // Tell the email router which platform this event came from
        // so it can send the reply via the matching provider (Gmail / MS Graph)
        sourceProvider: calendar?.provider as 'GOOGLE' | 'MICROSOFT' | undefined,
      },
    });

    // 3. Audit log
    await logAuditEvent({
      userId,
      action: AuditAction.INVITE_AUTO_REJECTED,
      resourceType: AuditResourceType.EVENT,
      resourceId: event.sourceEventId || 'unknown',
      newValue: {
        title: event.title,
        organizer: event.organizerEmail,
        reason: buildRejectionReason(conflictResult),
        conflictCount: conflictResult.conflicts.length,
      },
      source: AuditSource.SYSTEM,
    });

    conflictLogger.info({
      userId,
      eventTitle: event.title,
      organizer: event.organizerEmail,
      conflicts: conflictResult.conflicts.length,
    }, '❌ Meeting auto-rejected due to conflict');

  } catch (error) {
    conflictLogger.error({ userId, error }, 'Failed to handle auto-rejection');
  }
}

function buildRejectionReason(result: ConflictDetectionResult): string {
  const conflict = result.conflicts[0];
  if (!conflict) return 'Schedule conflict detected';
  return `The requested meeting conflicts with an existing calendar commitment (${conflict.overlapMinutes} minutes overlap with "${conflict.existingEvent.title}")`;
}

function buildRejectionEmailBody(
  event: Partial<CanonicalEvent>,
  result: ConflictDetectionResult,
  freeSlots: string[]
): string {
  const conflict = result.conflicts[0];
  const startStr = event.startTime ? new Date(event.startTime).toLocaleString() : 'Unknown';
  const endStr = event.endTime ? new Date(event.endTime).toLocaleString() : 'Unknown';

  const slotsListHtml = freeSlots.length > 0
    ? `
      <p style="color: #b0b0b0; margin-top: 20px;">However, I would love to connect. I am currently free at any of these upcoming times:</p>
      <ul style="color: #667eea; padding-left: 20px; margin: 10px 0;">
        ${freeSlots.map(slot => `<li style="margin: 6px 0;"><strong>${slot}</strong></li>`).join('')}
      </ul>
      <p style="color: #b0b0b0;">Please let me know if any of these options work for you, or feel free to suggest another time!</p>
    `
    : `
      <p style="color: #b0b0b0; margin-top: 20px;">I apologize for the inconvenience. Please feel free to suggest some alternative times next week that might work for you.</p>
    `;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f111a; border-radius: 12px; border: 1px solid #1e2130;">
      <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px; border-radius: 8px 8px 0 0; color: white; text-align: center;">
        <h2 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">📅 Meeting Invitation Decline</h2>
      </div>
      <div style="background: #0f111a; color: #e4e6eb; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="color: #e4e6eb; margin-top: 0; font-size: 15px; line-height: 1.5;">Hi,</p>
        <p style="color: #e4e6eb; font-size: 15px; line-height: 1.5;">
          Thank you for the invitation to <strong>"${event.title || 'Untitled'}"</strong>. 
          Unfortunately, I am not available at the proposed time of <strong>${startStr}</strong> because it conflicts with a prior calendar commitment.
        </p>
        
        ${slotsListHtml}

        <div style="border-top: 1px solid #1e2130; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #8f9bb3; line-height: 1.4;">
          <p style="margin: 0;"><em>This notification was sent automatically by CalendarSync on behalf of the user.</em></p>
        </div>
      </div>
    </div>
  `;
}
