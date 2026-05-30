// ============================================================
// Enterprise Calendar Sync — Sync Fingerprint Engine
// ============================================================
// Generates deterministic fingerprints for loop prevention.
// If two events have the same fingerprint, they're the same event
// and syncing should be SKIPPED to prevent infinite loops.
// ============================================================

import { sha256Hash } from '../crypto/encryption';
import { EventSyncPayload, CanonicalEvent } from '../types';

/**
 * Generate a sync fingerprint from an event.
 * This is a SHA-256 hash of the event's essential fields.
 * 
 * If the fingerprint matches the stored fingerprint for this event,
 * it means the event was synced BY US — we must NOT sync it again
 * (which would create an infinite loop).
 */
export function generateSyncFingerprint(event: Partial<CanonicalEvent> | EventSyncPayload): string {
  const payload = normalizeForFingerprint(event);
  return sha256Hash(JSON.stringify(payload));
}

/**
 * Normalize event data for consistent fingerprint generation.
 * Strips volatile fields (etags, timestamps) and sorts arrays.
 */
function normalizeForFingerprint(event: Partial<CanonicalEvent> | any): EventSyncPayload {
  const attendees = (event.attendees || [])
    .map((a: any) => (typeof a === 'string' ? a : a.email || ''))
    .filter(Boolean)
    .sort();

  return {
    title: (event.title || event.summary || '').trim().toLowerCase(),
    description: (event.description || '').trim().substring(0, 500).toLowerCase(),
    startTime: normalizeTime(event.startTime || event.start),
    endTime: normalizeTime(event.endTime || event.end),
    timezone: (event.timezone || 'UTC').toLowerCase(),
    location: (event.location || '').trim().toLowerCase(),
    attendees,
    status: event.status || 'confirmed',
    recurrenceRule: event.recurrenceRule || null,
  };
}

/**
 * Normalize a date/time to ISO string for consistent hashing.
 */
function normalizeTime(time: any): string {
  if (!time) return '';
  if (time instanceof Date) {
    return isNaN(time.getTime()) ? '' : time.toISOString();
  }
  if (typeof time === 'string') {
    const d = new Date(time);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  // Google format: { dateTime: '...', timeZone: '...' }
  if (time.dateTime) {
    const d = new Date(time.dateTime);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  if (time.date) return time.date;
  return '';
}

/**
 * Check if two fingerprints match (loop detection).
 * Returns true if the event should be SKIPPED.
 */
export function isSyncLoop(currentFingerprint: string, storedFingerprint: string | null): boolean {
  if (!storedFingerprint) return false;
  return currentFingerprint === storedFingerprint;
}

/**
 * Generate an idempotency key for a sync operation.
 * Ensures the same operation is never processed twice.
 */
export function generateIdempotencyKey(
  sourceProvider: string,
  sourceEventId: string,
  action: string,
  version: number
): string {
  return sha256Hash(`${sourceProvider}:${sourceEventId}:${action}:${version}`);
}
