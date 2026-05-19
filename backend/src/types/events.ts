// ============================================================
// Enterprise Calendar Sync — Core Event Types
// ============================================================
// Canonical event model: the single source of truth.
// All provider-specific events get normalized to this format.
// ============================================================

export interface CanonicalEvent {
  /** Internal UUID — the single source of truth ID */
  id: string;

  /** Global event UUID used across both platforms */
  globalEventUuid: string;

  /** Which calendar this event belongs to */
  calendarId: string;

  /** Which platform this event originally came from */
  sourcePlatform: CalendarProvider;

  /** The event's ID on the source platform */
  sourceEventId: string;

  /** The mirrored event ID on the other platform (null if not yet synced) */
  mirrorEventId: string | null;

  /** Which platform the mirror lives on */
  mirrorPlatform: CalendarProvider | null;

  /** Hash fingerprint for loop prevention */
  syncFingerprint: string;

  /** Idempotency key to prevent duplicate processing */
  idempotencyKey: string;

  /** Incrementing version for optimistic concurrency */
  syncVersion: number;

  // ---- Event Data ----
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  isAllDay: boolean;
  location: string;

  // ---- Status ----
  status: EventStatus;
  visibility: EventVisibility;
  showAs: ShowAsStatus;

  // ---- People ----
  organizerEmail: string;
  organizerName: string;
  isOrganizer: boolean;
  attendees: EventAttendee[];

  // ---- Recurrence ----
  recurrenceRule: RecurrenceRule | null;
  recurringEventId: string | null;
  isRecurringInstance: boolean;

  // ---- Extras ----
  reminders: EventReminder[];
  meetingLink: string;
  attachments: EventAttachment[];
  colorCategory: string;
  notes: string;

  // ---- Sync Metadata ----
  syncState: SyncState;
  conflictState: ConflictState;
  originPlatform: CalendarProvider;
  lastModifiedAt: Date;
  lastModifiedBy: string;
  etag: string;

  // ---- Timestamps ----
  createdAt: Date;
  updatedAt: Date;
}

export interface EventAttendee {
  email: string;
  name: string;
  responseStatus: AttendeeResponseStatus;
  isOptional: boolean;
  isOrganizer: boolean;
}

export interface EventReminder {
  method: 'email' | 'popup' | 'sms';
  minutesBefore: number;
}

export interface EventAttachment {
  title: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  count?: number;
  until?: Date;
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
}

// ---- Enums ----

export enum CalendarProvider {
  GOOGLE = 'google',
  MICROSOFT = 'microsoft',
}

export enum EventStatus {
  CONFIRMED = 'confirmed',
  TENTATIVE = 'tentative',
  CANCELLED = 'cancelled',
}

export enum EventVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
  CONFIDENTIAL = 'confidential',
  DEFAULT = 'default',
}

export enum ShowAsStatus {
  FREE = 'free',
  BUSY = 'busy',
  TENTATIVE = 'tentative',
  OUT_OF_OFFICE = 'oof',
  WORKING_ELSEWHERE = 'workingElsewhere',
  UNKNOWN = 'unknown',
}

export enum AttendeeResponseStatus {
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  TENTATIVE = 'tentative',
  NEEDS_ACTION = 'needsAction',
  NONE = 'none',
}

export enum SyncState {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  CONFLICT = 'conflict',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

export enum ConflictState {
  NONE = 'none',
  DETECTED = 'detected',
  RESOLVED = 'resolved',
  MANUAL_REVIEW = 'manual_review',
}

/** Minimal event payload used in sync comparisons */
export interface EventSyncPayload {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  attendees: string[];
  status: EventStatus;
  recurrenceRule: RecurrenceRule | null;
}

/** Free/busy time slot from either provider */
export interface FreeBusySlot {
  start: Date;
  end: Date;
  status: ShowAsStatus;
  provider: CalendarProvider;
  eventId?: string;
  title?: string;
}

/** Unified availability result */
export interface UnifiedAvailability {
  userId: string;
  timeMin: Date;
  timeMax: Date;
  busySlots: FreeBusySlot[];
  freeSlots: { start: Date; end: Date }[];
}
