// ============================================================
// Enterprise Calendar Sync — Conflict Detector
// ============================================================
// Checks BOTH calendars (Google + Outlook) for conflicts
// before accepting any meeting invite or syncing an event.
// ============================================================

import getDatabase from '../database/client';
import { getGoogleFreeBusy } from '../connectors/google/calendar';
import { getMicrosoftFreeBusy } from '../connectors/microsoft/calendar';
import { hasTimeOverlap, getOverlapMinutes, isBusinessHours } from '../utils/dates';
import { conflictLogger } from '../utils/logger';
import { ConflictDetectionResult, DetectedConflict, ConflictType, ConflictSeverity, ConflictRecommendation } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { decrypt } from '../crypto/encryption';

/**
 * Check for conflicts across BOTH calendars before syncing.
 * This is the smart availability engine.
 */
export async function checkForConflicts(
  userId: string,
  startTime: Date,
  endTime: Date,
  excludeEventId?: string | null
): Promise<ConflictDetectionResult> {
  const db = getDatabase();
  const conflicts: DetectedConflict[] = [];

  try {
    // 1. Check local database for known events in this time range
    const localConflicts = await db.event.findMany({
      where: {
        calendar: { userId, syncEnabled: true },
        status: { not: 'CANCELLED' },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
      },
      include: { calendar: true },
    });

    for (const existing of localConflicts) {
      if (hasTimeOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
        const overlap = getOverlapMinutes(startTime, endTime, existing.startTime, existing.endTime);
        conflicts.push({
          id: uuidv4(),
          type: ConflictType.TIME_OVERLAP,
          incomingEvent: {
            eventId: 'incoming',
            title: '(Incoming event)',
            startTime,
            endTime,
            provider: 'google' as any,
            organizerEmail: '',
            status: 'confirmed',
          },
          existingEvent: {
            eventId: existing.id,
            title: (() => {
              try {
                return decrypt(existing.title);
              } catch {
                return existing.title || 'Busy';
              }
            })(),
            startTime: existing.startTime,
            endTime: existing.endTime,
            provider: existing.calendar.provider.toLowerCase() as any,
            organizerEmail: existing.organizerEmail,
            status: existing.status.toLowerCase(),
          },
          overlapMinutes: overlap,
          severity: determineSeverity(existing),
        });
      }
    }

    // 2. Also query live free/busy from both providers
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user) {
      // Check Google free/busy
      if (user.googleConnected) {
        try {
          const googleCalendar = await db.calendar.findFirst({
            where: { userId, provider: 'GOOGLE', isPrimary: true },
          });
          if (googleCalendar) {
            const googleBusy = await getGoogleFreeBusy(userId, googleCalendar.externalCalendarId, startTime, endTime);
            for (const slot of googleBusy) {
              if (hasTimeOverlap(startTime, endTime, slot.start, slot.end)) {
                const alreadyFound = conflicts.some(c => 
                  c.existingEvent.startTime.getTime() === slot.start.getTime() &&
                  c.existingEvent.endTime.getTime() === slot.end.getTime()
                );
                if (!alreadyFound) {
                  conflicts.push({
                    id: uuidv4(),
                    type: ConflictType.DOUBLE_BOOKING,
                    incomingEvent: {
                      eventId: 'incoming',
                      title: '(Incoming event)',
                      startTime,
                      endTime,
                      provider: 'google' as any,
                      organizerEmail: '',
                      status: 'confirmed',
                    },
                    existingEvent: {
                      eventId: 'google-busy',
                      title: slot.title || 'Busy (Google)',
                      startTime: slot.start,
                      endTime: slot.end,
                      provider: 'google' as any,
                      organizerEmail: user.email,
                      status: 'busy',
                    },
                    overlapMinutes: getOverlapMinutes(startTime, endTime, slot.start, slot.end),
                    severity: ConflictSeverity.HIGH,
                  });
                }
              }
            }
          }
        } catch (error) {
          conflictLogger.warn({ userId, error }, 'Failed to check Google free/busy');
        }
      }

      // Check Microsoft free/busy
      if (user.microsoftConnected) {
        try {
          const msBusy = await getMicrosoftFreeBusy(userId, user.email, startTime, endTime);
          for (const slot of msBusy) {
            if (hasTimeOverlap(startTime, endTime, slot.start, slot.end)) {
              const alreadyFound = conflicts.some(c =>
                c.existingEvent.startTime.getTime() === slot.start.getTime() &&
                c.existingEvent.endTime.getTime() === slot.end.getTime()
              );
              if (!alreadyFound) {
                conflicts.push({
                  id: uuidv4(),
                  type: ConflictType.DOUBLE_BOOKING,
                  incomingEvent: {
                    eventId: 'incoming',
                    title: '(Incoming event)',
                    startTime,
                    endTime,
                    provider: 'microsoft' as any,
                    organizerEmail: '',
                    status: 'confirmed',
                  },
                  existingEvent: {
                    eventId: 'microsoft-busy',
                    title: slot.title || 'Busy (Outlook)',
                    startTime: slot.start,
                    endTime: slot.end,
                    provider: 'microsoft' as any,
                    organizerEmail: user.email,
                    status: 'busy',
                  },
                  overlapMinutes: getOverlapMinutes(startTime, endTime, slot.start, slot.end),
                  severity: ConflictSeverity.HIGH,
                });
              }
            }
          }
        } catch (error) {
          conflictLogger.warn({ userId, error }, 'Failed to check Microsoft free/busy');
        }
      }
    }

    // 3. Check for Out-of-Office conflicts
    if (user) {
      const oofEvents = await db.event.findMany({
        where: {
          calendar: { userId },
          showAs: 'OOF',
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      for (const oof of oofEvents) {
        conflicts.push({
          id: uuidv4(),
          type: ConflictType.OUT_OF_OFFICE_CONFLICT,
          incomingEvent: {
            eventId: 'incoming',
            title: '(Incoming event)',
            startTime, endTime,
            provider: 'google' as any,
            organizerEmail: '',
            status: 'confirmed',
          },
          existingEvent: {
            eventId: oof.id,
            title: (() => {
              try {
                return decrypt(oof.title);
              } catch {
                return oof.title || 'Out of Office';
              }
            })(),
            startTime: oof.startTime,
            endTime: oof.endTime,
            provider: oof.sourcePlatform?.toLowerCase() as any || 'google',
            organizerEmail: oof.organizerEmail,
            status: 'oof',
          },
          overlapMinutes: getOverlapMinutes(startTime, endTime, oof.startTime, oof.endTime),
          severity: ConflictSeverity.CRITICAL,
        });
      }

      // 4. Check for Focus Time violations
      const candidateFocusEvents = await db.event.findMany({
        where: {
          calendar: { userId },
          showAs: 'FREE',
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });

      const focusEvents = candidateFocusEvents.filter((ev: any) => {
        try {
          const titleDecrypted = decrypt(ev.title);
          return titleDecrypted.toLowerCase().includes('focus');
        } catch {
          return false;
        }
      });

      for (const focus of focusEvents) {
        conflicts.push({
          id: uuidv4(),
          type: ConflictType.FOCUS_TIME_VIOLATION,
          incomingEvent: {
            eventId: 'incoming',
            title: '(Incoming event)',
            startTime, endTime,
            provider: 'google' as any,
            organizerEmail: '',
            status: 'confirmed',
          },
          existingEvent: {
            eventId: focus.id,
            title: (() => {
              try {
                return decrypt(focus.title);
              } catch {
                return focus.title || 'Focus Time';
              }
            })(),
            startTime: focus.startTime,
            endTime: focus.endTime,
            provider: focus.sourcePlatform?.toLowerCase() as any || 'google',
            organizerEmail: focus.organizerEmail,
            status: 'focus',
          },
          overlapMinutes: getOverlapMinutes(startTime, endTime, focus.startTime, focus.endTime),
          severity: ConflictSeverity.HIGH,
        });
      }
    }

    // 5. Determine recommendation
    const recommendation = determineRecommendation(conflicts);

    conflictLogger.info({
      userId,
      conflictCount: conflicts.length,
      recommendation,
    }, 'Conflict detection complete');

    return { hasConflict: conflicts.length > 0, conflicts, recommendation };

  } catch (error) {
    conflictLogger.error({ userId, error }, 'Conflict detection failed');
    // Fail open — allow sync if conflict check fails
    return { hasConflict: false, conflicts: [], recommendation: ConflictRecommendation.AUTO_ACCEPT };
  }
}

function determineSeverity(event: any): ConflictSeverity {
  if (event.showAs === 'OOF') return ConflictSeverity.CRITICAL;
  if (event.status === 'CONFIRMED') return ConflictSeverity.HIGH;
  if (event.status === 'TENTATIVE') return ConflictSeverity.MEDIUM;
  return ConflictSeverity.LOW;
}

function determineRecommendation(conflicts: DetectedConflict[]): ConflictRecommendation {
  if (conflicts.length === 0) return ConflictRecommendation.AUTO_ACCEPT;
  
  const hasCritical = conflicts.some(c => c.severity === ConflictSeverity.CRITICAL);
  const hasHigh = conflicts.some(c => c.severity === ConflictSeverity.HIGH);
  
  if (hasCritical || hasHigh) return ConflictRecommendation.AUTO_REJECT;
  return ConflictRecommendation.MANUAL_REVIEW;
}

/**
 * Scans standard working hours for the next 3 days to find 
 * up to 3 upcoming free slots.
 */
export async function getAvailableSlots(
  userId: string,
  daysToSearch = 3
): Promise<string[]> {
  const db = getDatabase();
  const slots: string[] = [];

  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const primaryCalendar = await db.calendar.findFirst({
      where: { userId, isPrimary: true },
    });
    const timezone = primaryCalendar?.timezone || 'UTC';

    const searchStart = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const searchEnd = new Date(Date.now() + (daysToSearch + 1) * 24 * 60 * 60 * 1000); // Days to search + 1 day buffer

    // 1. Fetch Google busy slots
    let googleBusy: { start: Date; end: Date }[] = [];
    if (user.googleConnected && primaryCalendar && primaryCalendar.provider === 'GOOGLE') {
      try {
        googleBusy = await getGoogleFreeBusy(userId, primaryCalendar.externalCalendarId, searchStart, searchEnd);
      } catch (err) {
        conflictLogger.warn({ userId, err }, 'Failed to fetch Google busy slots for suggestions');
      }
    } else if (user.googleConnected) {
      const gCal = await db.calendar.findFirst({
        where: { userId, provider: 'GOOGLE', isPrimary: true },
      });
      if (gCal) {
        try {
          googleBusy = await getGoogleFreeBusy(userId, gCal.externalCalendarId, searchStart, searchEnd);
        } catch (err) {
          conflictLogger.warn({ userId, err }, 'Failed to fetch Google busy slots for suggestions');
        }
      }
    }

    // 2. Fetch Microsoft busy slots
    let msBusy: { start: Date; end: Date }[] = [];
    if (user.microsoftConnected) {
      try {
        msBusy = await getMicrosoftFreeBusy(userId, user.email, searchStart, searchEnd);
      } catch (err) {
        conflictLogger.warn({ userId, err }, 'Failed to fetch MS busy slots for suggestions');
      }
    }

    // 3. Fetch local events
    const localBusy: { start: Date; end: Date }[] = [];
    const localEvents = await db.event.findMany({
      where: {
        calendar: { userId, syncEnabled: true },
        status: { not: 'CANCELLED' },
        startTime: { lt: searchEnd },
        endTime: { gt: searchStart },
      },
    });
    for (const ev of localEvents) {
      localBusy.push({ start: ev.startTime, end: ev.endTime });
    }

    // Combine all busy intervals
    const allBusy = [...googleBusy, ...msBusy, ...localBusy];

    // Round search start to the next 30 minutes
    const stepMs = 30 * 60 * 1000;
    let currentTime = new Date(Math.ceil(searchStart.getTime() / stepMs) * stepMs);

    while (currentTime.getTime() < searchEnd.getTime() && slots.length < 3) {
      const candidateStart = new Date(currentTime);
      const candidateEnd = new Date(currentTime.getTime() + stepMs);

      // Check if candidate slot is in business hours, not weekend, and has no overlaps
      if (
        isBusinessHours(candidateStart, timezone) &&
        !isWeekend(candidateStart, timezone)
      ) {
        const hasOverlap = allBusy.some(busy =>
          hasTimeOverlap(candidateStart, candidateEnd, busy.start, busy.end)
        );

        if (!hasOverlap) {
          slots.push(formatSlot(candidateStart, timezone));
        }
      }

      // Advance by 30 minutes
      currentTime = new Date(currentTime.getTime() + stepMs);
    }
  } catch (error) {
    conflictLogger.error({ userId, error }, 'Failed to compute alternative slots');
  }

  return slots;
}

function isWeekend(date: Date, timezone: string): boolean {
  const dayStr = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  return dayStr === 'Sat' || dayStr === 'Sun';
}

function formatSlot(start: Date, timezone: string): string {
  const optionsDate: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  };
  const optionsTime: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  const dateStr = new Intl.DateTimeFormat('en-US', optionsDate).format(start);
  const timeStr = new Intl.DateTimeFormat('en-US', optionsTime).format(start);
  
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const endTimeStr = new Intl.DateTimeFormat('en-US', optionsTime).format(end);
  
  return `${dateStr} at ${timeStr} - ${endTimeStr}`;
}
