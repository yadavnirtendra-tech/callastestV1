// ============================================================
// Enterprise Calendar Sync — User Events Router
// ============================================================

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import getDatabase from '../database/client';
import { decrypt, encrypt } from '../crypto/encryption';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '../connectors/google/calendar';
import { createMicrosoftEvent, updateMicrosoftEvent, deleteMicrosoftEvent } from '../connectors/microsoft/calendar';
import { CalendarProvider, CanonicalEvent, EventStatus, EventVisibility, ShowAsStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { generateSyncFingerprint, generateIdempotencyKey } from '../sync/fingerprint';
import { logAuditEvent } from '../audit/logger';
import { AuditAction, AuditResourceType, AuditSource } from '../types';
import { getAvailableSlots, checkForConflicts } from '../conflict/detector';
import { queueNotification } from '../notifications/dispatcher';
import { addSyncJob } from '../queues/syncQueue';

const router = Router();
router.use(authenticateToken);

/** GET /api/events - List all master events for the user */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.sub;

    // Trigger sync for all active calendars of the user in the background
    const activeCalendars = await db.calendar.findMany({
      where: { userId, syncEnabled: true },
    });

    for (const calendar of activeCalendars) {
      addSyncJob(userId, calendar.id, calendar.provider).catch(err => {
        console.error('Failed to trigger background sync job for calendar', calendar.id, err);
      });
    }

    const dbEvents = await db.event.findMany({
      where: {
        calendar: {
          userId,
        },
        status: {
          not: 'CANCELLED'
        }
      },
      include: {
        calendar: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const events = dbEvents.map(event => {
      let title = '(No title)';
      let description = '';
      try {
        title = event.title ? decrypt(event.title) : '(No title)';
      } catch (err) {
        title = event.title;
      }
      try {
        description = event.description ? decrypt(event.description) : '';
      } catch (err) {
        description = event.description;
      }

      let parsedAttendees = [];
      if (event.attendees) {
        if (typeof event.attendees === 'string') {
          try {
            parsedAttendees = JSON.parse(event.attendees);
          } catch {
            parsedAttendees = [];
          }
        } else {
          parsedAttendees = event.attendees as any;
        }
      }

      return {
        ...event,
        title,
        description,
        attendees: parsedAttendees,
      };
    });

    res.json({ success: true, data: { events } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve events' },
    });
  }
});

/** POST /api/events - Create a new calendar event */
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.sub;
    const { title, description, startTime, endTime, location, timezone, isAllDay, attendees, syncGoogle, syncMicrosoft } = req.body;

    if (!title || !startTime || !endTime) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Title, start time, and end time are required' },
      });
      return;
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    // Resolve target calendars
    const googleCal = await db.calendar.findFirst({
      where: { userId, provider: 'GOOGLE', syncEnabled: true },
    });
    const msCal = await db.calendar.findFirst({
      where: { userId, provider: 'MICROSOFT', syncEnabled: true },
    });

    if (syncGoogle && !googleCal) {
      res.status(400).json({
        success: false,
        error: { code: 'CALENDAR_NOT_CONNECTED', message: 'Google Calendar is not connected or sync is disabled' },
      });
      return;
    }

    if (syncMicrosoft && !msCal) {
      res.status(400).json({
        success: false,
        error: { code: 'CALENDAR_NOT_CONNECTED', message: 'Outlook Calendar is not connected or sync is disabled' },
      });
      return;
    }

    if (!syncGoogle && !syncMicrosoft) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_CALENDAR_SELECTED', message: 'Must select at least one calendar to sync (Google or Outlook)' },
      });
      return;
    }

    // Conflict detection — check BOTH calendars before creating
    const conflictResult = await checkForConflicts(userId, new Date(startTime), new Date(endTime));
    if (conflictResult.hasConflict && conflictResult.recommendation === 'auto_reject') {
      const conflictTitles = conflictResult.conflicts
        .map(c => `"${c.existingEvent.title}" (${new Date(c.existingEvent.startTime).toLocaleTimeString()} - ${new Date(c.existingEvent.endTime).toLocaleTimeString()}, ${c.overlapMinutes}min overlap)`)
        .join(', ');
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT_DETECTED',
          message: `This time slot conflicts with existing events: ${conflictTitles}. Please choose a different time.`,
          conflicts: conflictResult.conflicts,
        },
      });
      return;
    }

    const globalEventUuid = `csync-${uuidv4()}`;
    const draftEvent: CanonicalEvent = {
      id: uuidv4(),
      calendarId: '',
      globalEventUuid,
      sourcePlatform: syncGoogle ? CalendarProvider.GOOGLE : CalendarProvider.MICROSOFT,
      sourceEventId: '',
      mirrorEventId: null,
      mirrorPlatform: null,
      syncFingerprint: '',
      idempotencyKey: '',
      syncVersion: 1,
      title,
      description: description || '',
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      timezone: timezone || 'UTC',
      isAllDay: !!isAllDay,
      location: location || '',
      status: EventStatus.CONFIRMED,
      visibility: EventVisibility.DEFAULT,
      showAs: ShowAsStatus.BUSY,
      organizerEmail: user.email,
      organizerName: user.displayName,
      isOrganizer: true,
      attendees: attendees || [],
      recurrenceRule: null,
      recurringEventId: null,
      isRecurringInstance: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      reminders: [],
      meetingLink: '',
      attachments: [],
      colorCategory: '',
      notes: '',
      syncState: 'SYNCED' as any,
      conflictState: 'NONE' as any,
      originPlatform: syncGoogle ? CalendarProvider.GOOGLE : CalendarProvider.MICROSOFT,
      lastModifiedAt: new Date(),
      lastModifiedBy: user.email,
      etag: '',
    };

    let googleEventId = '';
    if (syncGoogle && googleCal) {
      const googleEvent = await createGoogleEvent(userId, googleCal.externalCalendarId, draftEvent);
      googleEventId = googleEvent.id!;
    }

    let msEventId = '';
    if (syncMicrosoft && msCal) {
      const msEvent = await createMicrosoftEvent(userId, msCal.externalCalendarId, draftEvent);
      msEventId = msEvent.id!;
    }

    const primaryCalId = syncGoogle ? googleCal!.id : msCal!.id;
    const sourcePlatform = syncGoogle ? 'GOOGLE' : 'MICROSOFT';
    const sourceEventId = syncGoogle ? googleEventId : msEventId;
    const mirrorPlatform = (syncGoogle && syncMicrosoft) ? 'MICROSOFT' : null;
    const mirrorEventId = (syncGoogle && syncMicrosoft) ? msEventId : null;

    const fp = generateSyncFingerprint(draftEvent);
    const idempotencyKey = generateIdempotencyKey(sourcePlatform, sourceEventId, 'CREATE', 1);

    const createdEvent = await db.event.create({
      data: {
        calendarId: primaryCalId,
        globalEventUuid,
        sourcePlatform: sourcePlatform as any,
        sourceEventId,
        mirrorEventId,
        mirrorPlatform: mirrorPlatform as any,
        syncFingerprint: fp,
        idempotencyKey,
        syncVersion: 1,
        title: encrypt(title),
        description: encrypt(description || ''),
        startTime: draftEvent.startTime,
        endTime: draftEvent.endTime,
        timezone: draftEvent.timezone,
        isAllDay: draftEvent.isAllDay,
        location: draftEvent.location,
        status: 'CONFIRMED',
        visibility: 'DEFAULT',
        showAs: 'BUSY',
        organizerEmail: user.email,
        organizerName: user.displayName,
        isOrganizer: true,
        attendees: JSON.stringify(attendees || []),
        syncState: 'SYNCED',
        conflictState: 'NONE',
        originPlatform: sourcePlatform as any,
      },
    });

    await logAuditEvent({
      userId,
      action: AuditAction.EVENT_CREATED,
      resourceType: AuditResourceType.EVENT,
      resourceId: createdEvent.id,
      newValue: { title, syncGoogle, syncMicrosoft },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.status(201).json({
      success: true,
      data: {
        event: {
          ...createdEvent,
          title,
          description,
          attendees,
        },
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to create event' },
    });
  }
});

/** PUT /api/events/:id - Update an existing event */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.sub;
    const { id } = req.params;
    const { title, description, startTime, endTime, location, timezone, isAllDay, attendees } = req.body;

    const event = await db.event.findUnique({
      where: { id },
      include: { calendar: true },
    });

    if (!event || event.calendar.userId !== userId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Event not found' } });
      return;
    }

    const googleCal = await db.calendar.findFirst({
      where: { userId, provider: 'GOOGLE', syncEnabled: true },
    });

    const updatedDraft: CanonicalEvent = {
      id: event.id,
      calendarId: event.calendarId,
      globalEventUuid: event.globalEventUuid,
      sourcePlatform: event.sourcePlatform as any,
      sourceEventId: event.sourceEventId,
      mirrorEventId: event.mirrorEventId,
      mirrorPlatform: event.mirrorPlatform as any,
      syncFingerprint: '',
      idempotencyKey: '',
      syncVersion: event.syncVersion + 1,
      title: title || '',
      description: description || '',
      startTime: new Date(startTime || event.startTime),
      endTime: new Date(endTime || event.endTime),
      timezone: timezone || event.timezone,
      isAllDay: isAllDay !== undefined ? !!isAllDay : event.isAllDay,
      location: location || event.location,
      status: event.status as any,
      visibility: event.visibility as any,
      showAs: event.showAs as any,
      organizerEmail: event.organizerEmail,
      organizerName: event.organizerName,
      isOrganizer: event.isOrganizer,
      attendees: attendees || [],
      recurrenceRule: event.recurrenceRule as any,
      recurringEventId: event.recurringEventId,
      isRecurringInstance: event.isRecurringInstance,
      createdAt: event.createdAt,
      updatedAt: new Date(),
      reminders: [],
      meetingLink: event.meetingLink,
      attachments: [],
      colorCategory: event.colorCategory,
      notes: '',
      syncState: event.syncState as any,
      conflictState: event.conflictState as any,
      originPlatform: event.originPlatform as any,
      lastModifiedAt: new Date(),
      lastModifiedBy: event.organizerEmail,
      etag: event.etag,
    };

    // Update on platforms
    if (event.sourcePlatform === 'GOOGLE') {
      await updateGoogleEvent(userId, event.calendar.externalCalendarId, event.sourceEventId, updatedDraft);
    } else if (event.sourcePlatform === 'MICROSOFT') {
      await updateMicrosoftEvent(userId, event.sourceEventId, updatedDraft);
    }

    if (event.mirrorPlatform === 'GOOGLE' && event.mirrorEventId && googleCal) {
      await updateGoogleEvent(userId, googleCal.externalCalendarId, event.mirrorEventId, updatedDraft);
    } else if (event.mirrorPlatform === 'MICROSOFT' && event.mirrorEventId) {
      await updateMicrosoftEvent(userId, event.mirrorEventId, updatedDraft);
    }

    const fp = generateSyncFingerprint(updatedDraft);
    const idempotencyKey = generateIdempotencyKey(event.sourcePlatform, event.sourceEventId, 'UPDATE', event.syncVersion + 1);

    const updatedEvent = await db.event.update({
      where: { id },
      data: {
        title: encrypt(title),
        description: encrypt(description || ''),
        startTime: updatedDraft.startTime,
        endTime: updatedDraft.endTime,
        timezone: updatedDraft.timezone,
        isAllDay: updatedDraft.isAllDay,
        location: updatedDraft.location,
        attendees: JSON.stringify(attendees || []),
        syncFingerprint: fp,
        idempotencyKey,
        syncVersion: { increment: 1 },
      },
    });

    await logAuditEvent({
      userId,
      action: AuditAction.EVENT_UPDATED,
      resourceType: AuditResourceType.EVENT,
      resourceId: event.id,
      newValue: { title },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.json({
      success: true,
      data: {
        event: {
          ...updatedEvent,
          title,
          description,
          attendees,
        },
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to update event' },
    });
  }
});

/** DELETE /api/events/:id - Delete a user event */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.sub;
    const { id } = req.params;

    const event = await db.event.findUnique({
      where: { id },
      include: { calendar: true },
    });

    if (!event || event.calendar.userId !== userId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Event not found' } });
      return;
    }

    const googleCal = await db.calendar.findFirst({
      where: { userId, provider: 'GOOGLE', syncEnabled: true },
    });

    // Delete on Google
    if (event.sourcePlatform === 'GOOGLE') {
      try {
        await deleteGoogleEvent(userId, event.calendar.externalCalendarId, event.sourceEventId);
      } catch (err) {
        // Log but continue
      }
    } else if (event.mirrorPlatform === 'GOOGLE' && event.mirrorEventId && googleCal) {
      try {
        await deleteGoogleEvent(userId, googleCal.externalCalendarId, event.mirrorEventId);
      } catch (err) {}
    }

    // Delete on Microsoft
    if (event.sourcePlatform === 'MICROSOFT') {
      try {
        await deleteMicrosoftEvent(userId, event.sourceEventId);
      } catch (err) {}
    } else if (event.mirrorPlatform === 'MICROSOFT' && event.mirrorEventId) {
      try {
        await deleteMicrosoftEvent(userId, event.mirrorEventId);
      } catch (err) {}
    }

    // Delete in DB (safe — no crash if already removed)
    await db.event.deleteMany({ where: { id } });

    await logAuditEvent({
      userId,
      action: AuditAction.EVENT_DELETED,
      resourceType: AuditResourceType.EVENT,
      resourceId: id,
      oldValue: { id },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.json({ success: true, data: { message: 'Event deleted successfully' } });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to delete event' },
    });
  }
});

/** POST /api/events/:id/decline - Decline invitation (manual decline with custom message support) */
router.post('/:id/decline', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const userId = req.user!.sub;
    const { id } = req.params;
    const { customMessage } = req.body;

    const event = await db.event.findUnique({
      where: { id },
      include: { calendar: true },
    });

    if (!event || event.calendar.userId !== userId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Event not found' } });
      return;
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    let titleDecrypted = 'Untitled Event';
    try {
      titleDecrypted = event.title ? decrypt(event.title) : 'Untitled Event';
    } catch (err) {
      titleDecrypted = event.title;
    }

    // 1. Delete the event from platforms
    const googleCal = await db.calendar.findFirst({
      where: { userId, provider: 'GOOGLE', syncEnabled: true },
    });

    if (event.sourcePlatform === 'GOOGLE') {
      try {
        await deleteGoogleEvent(userId, event.calendar.externalCalendarId, event.sourceEventId);
      } catch (err) {}
    } else if (event.mirrorPlatform === 'GOOGLE' && event.mirrorEventId && googleCal) {
      try {
        await deleteGoogleEvent(userId, googleCal.externalCalendarId, event.mirrorEventId);
      } catch (err) {}
    }

    if (event.sourcePlatform === 'MICROSOFT') {
      try {
        await deleteMicrosoftEvent(userId, event.sourceEventId);
      } catch (err) {}
    } else if (event.mirrorPlatform === 'MICROSOFT' && event.mirrorEventId) {
      try {
        await deleteMicrosoftEvent(userId, event.mirrorEventId);
      } catch (err) {}
    }

    // 2. Delete event locally (safe — no crash if already removed)
    await db.event.deleteMany({ where: { id } });

    // 3. Format email body based on custom message vs. automatic slot suggestions
    let emailBody = '';
    if (customMessage && customMessage.trim()) {
      emailBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f111a; border-radius: 12px; border: 1px solid #1e2130;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px; border-radius: 8px 8px 0 0; color: white; text-align: center;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">📅 Meeting Invitation Decline</h2>
          </div>
          <div style="background: #0f111a; color: #e4e6eb; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="color: #e4e6eb; margin-top: 0; font-size: 15px; line-height: 1.5;">Hi,</p>
            <p style="color: #e4e6eb; font-size: 15px; line-height: 1.5;">
              Thank you for the invitation to <strong>"${titleDecrypted}"</strong> scheduled for <strong>${new Date(event.startTime).toLocaleString()}</strong>.
              Unfortunately, I am unable to attend.
            </p>
            
            <p style="color: #e4e6eb; font-size: 15px; line-height: 1.5; padding: 12px; background: #1e2130; border-radius: 6px; border-left: 4px solid #7c3aed; margin: 20px 0;">
              "${customMessage.trim()}"
            </p>

            <div style="border-top: 1px solid #1e2130; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #8f9bb3; line-height: 1.4;">
              <p style="margin: 0;"><em>This notification was sent on behalf of ${user.displayName}.</em></p>
            </div>
          </div>
        </div>
      `;
    } else {
      // Automatic slot suggestions
      const freeSlots = await getAvailableSlots(userId);
      const slotsListHtml = freeSlots.length > 0
        ? `
          <p style="color: #b0b0b0; margin-top: 20px;">However, I would love to connect. I am currently free at any of these upcoming times:</p>
          <ul style="color: #667eea; padding-left: 20px; margin: 10px 0;">
            ${freeSlots.map(slot => `<li style="margin: 6px 0;"><strong>${slot}</strong></li>`).join('')}
          </ul>
          <p style="color: #b0b0b0;">Please let me know if any of these options work for you, or propose alternative options!</p>
        `
        : `
          <p style="color: #b0b0b0; margin-top: 20px;">I apologize for the inconvenience. Please feel free to suggest some alternative times that might work for you.</p>
        `;

      emailBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0f111a; border-radius: 12px; border: 1px solid #1e2130;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 24px; border-radius: 8px 8px 0 0; color: white; text-align: center;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.5px;">📅 Meeting Invitation Decline</h2>
          </div>
          <div style="background: #0f111a; color: #e4e6eb; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="color: #e4e6eb; margin-top: 0; font-size: 15px; line-height: 1.5;">Hi,</p>
            <p style="color: #e4e6eb; font-size: 15px; line-height: 1.5;">
              Thank you for the invitation to <strong>"${titleDecrypted}"</strong>. 
              Unfortunately, I am not available at the proposed time of <strong>${new Date(event.startTime).toLocaleString()}</strong> because it conflicts with a prior calendar commitment.
            </p>
            
            ${slotsListHtml}
    
            <div style="border-top: 1px solid #1e2130; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #8f9bb3; line-height: 1.4;">
              <p style="margin: 0;"><em>This notification was sent automatically by CalendarSync on behalf of the user.</em></p>
            </div>
          </div>
        </div>
      `;
    }

    // 4. Send email (queue notification)
    if (event.organizerEmail) {
      await queueNotification({
        userId,
        type: 'rejection',
        channel: 'email',
        subject: `Decline: ${titleDecrypted}`,
        body: emailBody,
        metadata: {
          eventTitle: titleDecrypted,
          organizerEmail: event.organizerEmail,
          startTime: event.startTime,
          endTime: event.endTime,
          sourceProvider: event.calendar?.provider,
        },
      });
    }

    await logAuditEvent({
      userId,
      action: AuditAction.EVENT_DECLINED,
      resourceType: AuditResourceType.EVENT,
      resourceId: id,
      newValue: { title: titleDecrypted, customMessage: !!customMessage },
      ipAddress: req.ip || '0.0.0.0',
      userAgent: req.headers['user-agent'] || '',
      source: AuditSource.USER,
    });

    res.json({ success: true, data: { message: 'Event declined and rejection email queued successfully.' } });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: (error as Error).message || 'Failed to decline event' },
    });
  }
});

export default router;
