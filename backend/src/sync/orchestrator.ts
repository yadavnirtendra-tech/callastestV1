// ============================================================
// Enterprise Calendar Sync — Sync Orchestrator (Core Engine)
// ============================================================
// The brain of the sync system. Handles:
// 1. Receiving webhook notifications
// 2. Fetching changed events from source platform
// 3. Loop prevention via fingerprint comparison
// 4. Conflict checking via conflict engine
// 5. Creating/updating mirror events on target platform
// 6. Recording sync transactions
// 7. Audit logging everything
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import getDatabase from '../database/client';
import { syncLogger } from '../utils/logger';
import { generateSyncFingerprint, isSyncLoop, generateIdempotencyKey } from './fingerprint';
import { listGoogleEvents, createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, googleEventToCanonical } from '../connectors/google/calendar';
import { listMicrosoftEvents, createMicrosoftEvent, updateMicrosoftEvent, deleteMicrosoftEvent, microsoftEventToCanonical } from '../connectors/microsoft/calendar';
import { checkForConflicts } from '../conflict/detector';
import { handleAutoRejection } from '../conflict/autoReject';
import { logAuditEvent } from '../audit/logger';
import { CalendarProvider, CanonicalEvent, SyncState, ConflictState, AuditAction, AuditResourceType, AuditSource } from '../types';
import { encrypt } from '../crypto/encryption';

/**
 * Process a webhook notification — the main sync entry point.
 * Called by the queue worker when a webhook is received.
 */
export async function processSyncWebhook(
  userId: string,
  calendarId: string,
  provider: CalendarProvider
): Promise<void> {
  const db = getDatabase();
  const startTime = Date.now();

  syncLogger.info({ userId, calendarId, provider }, 'Starting sync processing');

  try {
    // 1. Get calendar record with sync token
    const calendar = await db.calendar.findFirst({
      where: { id: calendarId, userId },
      include: { user: true },
    });

    if (!calendar || !calendar.syncEnabled) {
      syncLogger.warn({ calendarId }, 'Calendar not found or sync disabled');
      return;
    }

    // 2. Fetch changed events from source platform
    let changedEvents: any[] = [];
    let newSyncToken: string | null = null;

    if (provider === CalendarProvider.GOOGLE) {
      const result = await listGoogleEvents(userId, calendar.externalCalendarId, calendar.syncToken);
      changedEvents = result.events;
      newSyncToken = result.nextSyncToken;
    } else {
      const result = await listMicrosoftEvents(userId, calendar.externalCalendarId, calendar.syncToken);
      changedEvents = result.events;
      newSyncToken = result.nextDeltaLink;
    }

    syncLogger.info({ userId, provider, changedCount: changedEvents.length }, 'Fetched changed events');

    // 3. Process each changed event
    for (const rawEvent of changedEvents) {
      try {
        await processEventChange(userId, calendar, rawEvent, provider);
      } catch (error) {
        syncLogger.error({ userId, eventId: rawEvent.id, error }, 'Failed to process event');
      }
    }

    // 4. Update sync token for incremental sync
    if (newSyncToken) {
      await db.calendar.update({
        where: { id: calendarId },
        data: { syncToken: newSyncToken, lastSyncedAt: new Date() },
      });
    }

    const duration = Date.now() - startTime;
    syncLogger.info({ userId, provider, duration: `${duration}ms`, processed: changedEvents.length }, 'Sync completed');

  } catch (error) {
    syncLogger.error({ userId, calendarId, provider, error }, 'Sync processing failed');
    await logAuditEvent({
      userId,
      action: AuditAction.SYNC_FAILED,
      resourceType: AuditResourceType.CALENDAR,
      resourceId: calendarId,
      newValue: { error: (error as Error).message, provider },
      source: AuditSource.SYSTEM,
    });
    throw error;
  }
}

/**
 * Process a single event change — the core sync logic.
 */
async function processEventChange(
  userId: string,
  calendar: any,
  rawEvent: any,
  sourceProvider: CalendarProvider
): Promise<void> {
  const db = getDatabase();
  const targetProvider = sourceProvider === CalendarProvider.GOOGLE ? CalendarProvider.MICROSOFT : CalendarProvider.GOOGLE;

  // 1. Normalize to canonical model
  const normalizedEvent = sourceProvider === CalendarProvider.GOOGLE
    ? googleEventToCanonical(rawEvent, calendar.id)
    : microsoftEventToCanonical(rawEvent, calendar.id);

  const sourceEventId = normalizedEvent.sourceEventId!;

  // 2. LOOP PREVENTION — the most critical check
  const fingerprint = generateSyncFingerprint(normalizedEvent);
  
  // Find if event exists (either as source or mirror) under any of this user's calendars
  const existingEvent = await db.event.findFirst({
    where: {
      calendar: {
        userId,
      },
      OR: [
        {
          sourceEventId,
          sourcePlatform: sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT',
        },
        {
          mirrorEventId: sourceEventId,
          mirrorPlatform: sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT',
        },
      ],
    },
    include: {
      calendar: true,
    },
  });

  if (existingEvent) {
    // Check if this change was caused by our own sync
    if (isSyncLoop(fingerprint, existingEvent.syncFingerprint)) {
      syncLogger.info(
        { userId, sourceEventId, provider: sourceProvider },
        '🔄 LOOP PREVENTED — event fingerprint matches our sync, skipping'
      );
      await logAuditEvent({
        userId,
        action: AuditAction.SYNC_LOOP_PREVENTED,
        resourceType: AuditResourceType.EVENT,
        resourceId: existingEvent.id,
        source: AuditSource.SYSTEM,
      });
      return;
    }
  }

  // 3. Generate idempotency key
  const version = existingEvent ? existingEvent.syncVersion + 1 : 1;
  const isCancelled = rawEvent.status === 'cancelled' || rawEvent['@removed'];
  const action = isCancelled ? 'delete' : (existingEvent ? 'update' : 'create');
  const idempotencyKey = generateIdempotencyKey(sourceProvider, sourceEventId, action, version);

  // Check idempotency
  const existingTransaction = await db.syncTransaction.findUnique({
    where: { transactionId: idempotencyKey },
  });
  if (existingTransaction) {
    syncLogger.info({ userId, sourceEventId, action }, 'Idempotency: already processed, skipping');
    return;
  }

  // 4. Handle deletion
  if (isCancelled) {
    let targetEventIdToDelete: string | null = null;
    if (existingEvent) {
      if (existingEvent.sourcePlatform === (sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT')) {
        targetEventIdToDelete = existingEvent.mirrorEventId;
      } else {
        targetEventIdToDelete = existingEvent.sourceEventId;
      }
    }
    await handleEventDeletion(userId, calendar, existingEvent, targetProvider, idempotencyKey, targetEventIdToDelete);
    return;
  }

  // 5. Get target calendar
  const targetCalendar = await db.calendar.findFirst({
    where: {
      userId,
      provider: targetProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT',
      isPrimary: true,
      syncEnabled: true,
    },
  });

  if (!targetCalendar) {
    syncLogger.warn({ userId, targetProvider }, 'No target calendar found for sync');
    return;
  }

  // 6. CONFLICT CHECK — check both calendars before syncing
  const conflictResult = await checkForConflicts(
    userId,
    normalizedEvent.startTime!,
    normalizedEvent.endTime!,
    existingEvent?.id
  );

  if (conflictResult.hasConflict && conflictResult.recommendation === 'auto_reject') {
    syncLogger.info({ userId, sourceEventId, conflicts: conflictResult.conflicts.length }, 'Conflict detected — auto-rejecting');
    await handleAutoRejection(userId, normalizedEvent as any, conflictResult, calendar, idempotencyKey);
    return;
  }

  // Determine the targetEventId to update if updating
  let targetEventId: string | null = null;
  if (existingEvent) {
    if (existingEvent.sourcePlatform === (sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT')) {
      targetEventId = existingEvent.mirrorEventId;
    } else {
      targetEventId = existingEvent.sourceEventId;
    }
  }

  // 7. Create or update mirror event on target platform
  let mirrorEventId: string | null = null;

  if (action === 'create') {
    mirrorEventId = await createMirrorEvent(userId, targetCalendar, normalizedEvent as CanonicalEvent, targetProvider, fingerprint);
  } else if (action === 'update') {
    if (targetEventId) {
      mirrorEventId = await updateMirrorEvent(userId, targetCalendar, targetEventId, normalizedEvent as CanonicalEvent, targetProvider, fingerprint);
    } else {
      // Mirror event doesn't exist yet on target platform, let's create it!
      mirrorEventId = await createMirrorEvent(userId, targetCalendar, normalizedEvent as CanonicalEvent, targetProvider, fingerprint);
    }
  }

  // 8. Upsert the canonical event in our database
  const globalEventUuid = existingEvent?.globalEventUuid || `csync-${uuidv4()}`;

  // Decide sourceEventId and mirrorEventId for the database row to keep the original direction
  let dbSourceEventId: string;
  let dbMirrorEventId: string | null;
  let dbSourcePlatform: 'GOOGLE' | 'MICROSOFT';
  let dbMirrorPlatform: 'GOOGLE' | 'MICROSOFT' | null;

  if (existingEvent) {
    dbSourceEventId = existingEvent.sourceEventId;
    dbSourcePlatform = existingEvent.sourcePlatform;
    
    if (existingEvent.sourcePlatform === (sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' : 'MICROSOFT')) {
      dbMirrorEventId = mirrorEventId || existingEvent.mirrorEventId;
      dbMirrorPlatform = mirrorEventId ? (targetProvider === CalendarProvider.GOOGLE ? 'GOOGLE' as const : 'MICROSOFT' as const) : existingEvent.mirrorPlatform;
    } else {
      dbSourceEventId = mirrorEventId || existingEvent.sourceEventId;
      dbMirrorEventId = existingEvent.mirrorEventId;
      dbMirrorPlatform = existingEvent.mirrorPlatform;
    }
  } else {
    dbSourceEventId = sourceEventId;
    dbSourcePlatform = sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' as const : 'MICROSOFT' as const;
    dbMirrorEventId = mirrorEventId;
    dbMirrorPlatform = mirrorEventId ? (targetProvider === CalendarProvider.GOOGLE ? 'GOOGLE' as const : 'MICROSOFT' as const) : null;
  }

  const eventData = {
    calendarId: existingEvent ? existingEvent.calendarId : calendar.id,
    globalEventUuid,
    sourcePlatform: dbSourcePlatform,
    sourceEventId: dbSourceEventId,
    mirrorEventId: dbMirrorEventId,
    mirrorPlatform: dbMirrorPlatform,
    syncFingerprint: fingerprint,
    idempotencyKey,
    syncVersion: version,
    title: encrypt(normalizedEvent.title || ''),
    description: encrypt(normalizedEvent.description || ''),
    startTime: normalizedEvent.startTime!,
    endTime: normalizedEvent.endTime!,
    timezone: normalizedEvent.timezone || 'UTC',
    isAllDay: normalizedEvent.isAllDay || false,
    location: normalizedEvent.location || '',
    status: mapStatusToEnum(normalizedEvent.status),
    visibility: mapVisibilityToEnum(normalizedEvent.visibility),
    showAs: mapShowAsToEnum(normalizedEvent.showAs),
    organizerEmail: normalizedEvent.organizerEmail || '',
    organizerName: normalizedEvent.organizerName || '',
    isOrganizer: normalizedEvent.isOrganizer || false,
    attendees: JSON.stringify(normalizedEvent.attendees || []),
    recurrenceRule: (normalizedEvent.recurrenceRule as any) || undefined,
    recurringEventId: normalizedEvent.recurringEventId || null,
    isRecurringInstance: normalizedEvent.isRecurringInstance || false,
    meetingLink: normalizedEvent.meetingLink || '',
    syncState: (dbMirrorEventId || dbSourceEventId) ? 'SYNCED' as const : 'PENDING' as const,
    conflictState: conflictResult.hasConflict ? 'DETECTED' as const : 'NONE' as const,
    originPlatform: existingEvent ? existingEvent.originPlatform : (sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE' as const : 'MICROSOFT' as const),
    lastModifiedAt: normalizedEvent.lastModifiedAt || new Date(),
    lastModifiedBy: normalizedEvent.organizerEmail || 'system',
    etag: normalizedEvent.etag || '',
  };

  if (existingEvent) {
    await db.event.update({ where: { id: existingEvent.id }, data: eventData });
  } else {
    await db.event.create({ data: eventData });
  }

  // 9. Record sync transaction
  const direction = sourceProvider === CalendarProvider.GOOGLE ? 'GOOGLE_TO_OUTLOOK' : 'OUTLOOK_TO_GOOGLE';
  await db.syncTransaction.create({
    data: {
      eventId: existingEvent?.id || (await db.event.findUnique({ where: { idempotencyKey } }))!.id,
      transactionId: idempotencyKey,
      direction: direction as any,
      action: action.toUpperCase() as any,
      status: mirrorEventId ? 'COMPLETED' : 'FAILED',
      sourceEventId,
      targetEventId: mirrorEventId,
      sourcePayload: normalizedEvent as any,
    },
  });

  // 10. Audit log
  await logAuditEvent({
    userId,
    action: action === 'create' ? AuditAction.EVENT_CREATED : AuditAction.EVENT_UPDATED,
    resourceType: AuditResourceType.EVENT,
    resourceId: globalEventUuid,
    newValue: { sourceProvider, action, mirrorEventId },
    source: AuditSource.WEBHOOK,
  });

  syncLogger.info(
    { userId, sourceEventId, mirrorEventId, action, direction },
    `✅ Sync ${action} completed`
  );
}

// ---- Helper Functions ----

async function createMirrorEvent(
  userId: string,
  targetCalendar: any,
  event: CanonicalEvent,
  targetProvider: CalendarProvider,
  fingerprint: string
): Promise<string | null> {
  try {
    if (targetProvider === CalendarProvider.GOOGLE) {
      const created = await createGoogleEvent(userId, targetCalendar.externalCalendarId, event);
      return created.id || null;
    } else {
      const created = await createMicrosoftEvent(userId, targetCalendar.externalCalendarId, event);
      return created.id || null;
    }
  } catch (error) {
    syncLogger.error({ userId, error }, 'Failed to create mirror event');
    return null;
  }
}

async function updateMirrorEvent(
  userId: string,
  targetCalendar: any,
  mirrorEventId: string,
  event: CanonicalEvent,
  targetProvider: CalendarProvider,
  fingerprint: string
): Promise<string | null> {
  try {
    if (targetProvider === CalendarProvider.GOOGLE) {
      await updateGoogleEvent(userId, targetCalendar.externalCalendarId, mirrorEventId, event);
    } else {
      await updateMicrosoftEvent(userId, mirrorEventId, event);
    }
    return mirrorEventId;
  } catch (error) {
    syncLogger.error({ userId, mirrorEventId, error }, 'Failed to update mirror event');
    return null;
  }
}

async function handleEventDeletion(
  userId: string,
  calendar: any,
  existingEvent: any,
  targetProvider: CalendarProvider,
  idempotencyKey: string,
  targetEventId: string | null
): Promise<void> {
  if (!existingEvent) return;

  const db = getDatabase();
  try {
    if (targetEventId) {
      if (targetProvider === CalendarProvider.GOOGLE) {
        const targetCal = await db.calendar.findFirst({
          where: { userId, provider: 'GOOGLE', isPrimary: true },
        });
        if (targetCal) await deleteGoogleEvent(userId, targetCal.externalCalendarId, targetEventId);
      } else {
        await deleteMicrosoftEvent(userId, targetEventId);
      }
    }

    await db.event.update({
      where: { id: existingEvent.id },
      data: { status: 'CANCELLED', syncState: 'SYNCED' },
    });

    syncLogger.info({ userId, eventId: existingEvent.id }, '🗑️ Event deleted on both platforms');
  } catch (error) {
    syncLogger.error({ userId, error }, 'Failed to delete mirror event');
  }
}

// ---- Enum Mappers ----
function mapStatusToEnum(status: any): 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED' {
  if (typeof status === 'string') {
    const upper = status.toUpperCase();
    if (upper === 'CONFIRMED' || upper === 'TENTATIVE' || upper === 'CANCELLED') return upper as any;
  }
  return 'CONFIRMED';
}

function mapVisibilityToEnum(vis: any): 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL' | 'DEFAULT' {
  if (typeof vis === 'string') {
    const upper = vis.toUpperCase();
    if (['PUBLIC', 'PRIVATE', 'CONFIDENTIAL', 'DEFAULT'].includes(upper)) return upper as any;
  }
  return 'DEFAULT';
}

function mapShowAsToEnum(showAs: any): 'FREE' | 'BUSY' | 'TENTATIVE' | 'OOF' | 'WORKING_ELSEWHERE' | 'UNKNOWN' {
  if (typeof showAs === 'string') {
    const upper = showAs.toUpperCase();
    if (['FREE', 'BUSY', 'TENTATIVE', 'OOF', 'WORKING_ELSEWHERE', 'UNKNOWN'].includes(upper)) return upper as any;
  }
  return 'BUSY';
}
