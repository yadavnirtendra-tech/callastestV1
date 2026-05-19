// ============================================================
// Enterprise Calendar Sync — Conflict Types
// ============================================================

import { CalendarProvider, FreeBusySlot } from './events';

export interface ConflictDetectionResult {
  hasConflict: boolean;
  conflicts: DetectedConflict[];
  recommendation: ConflictRecommendation;
}

export interface DetectedConflict {
  id: string;
  type: ConflictType;
  incomingEvent: ConflictEventSummary;
  existingEvent: ConflictEventSummary;
  overlapMinutes: number;
  severity: ConflictSeverity;
}

export interface ConflictEventSummary {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  provider: CalendarProvider;
  organizerEmail: string;
  status: string;
}

export enum ConflictType {
  TIME_OVERLAP = 'time_overlap',
  DOUBLE_BOOKING = 'double_booking',
  VERSION_CONFLICT = 'version_conflict',
  RECURRING_OVERLAP = 'recurring_overlap',
  FOCUS_TIME_VIOLATION = 'focus_time_violation',
  OUT_OF_OFFICE_CONFLICT = 'out_of_office_conflict',
}

export enum ConflictSeverity {
  LOW = 'low',         // Tentative overlap
  MEDIUM = 'medium',   // Confirmed event overlap
  HIGH = 'high',       // Organizer conflict
  CRITICAL = 'critical', // Double-booking with accepted events
}

export enum ConflictRecommendation {
  AUTO_ACCEPT = 'auto_accept',       // No conflicts found
  AUTO_REJECT = 'auto_reject',       // Clear conflict, auto-decline
  MANUAL_REVIEW = 'manual_review',   // Ambiguous, needs human
  RESCHEDULE = 'reschedule',         // Suggest alternative time
}

export enum ConflictResolution {
  AUTO_REJECTED = 'auto_rejected',
  ADMIN_OVERRIDE = 'admin_override',
  LATEST_WINS = 'latest_wins',
  SOURCE_PRIORITY = 'source_priority',
  ORGANIZER_PRIORITY = 'organizer_priority',
  MANUAL = 'manual',
}

/** Rejection action details */
export interface RejectionAction {
  eventId: string;
  userId: string;
  reason: string;
  conflictWith: ConflictEventSummary;
  rejectedAt: Date;
  emailSent: boolean;
  notificationId: string;
}

/** Duplicate detection result */
export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  confidence: number;    // 0.0 - 1.0
  matchType: DuplicateMatchType;
  existingEventId: string | null;
  matchDetails: string;
}

export enum DuplicateMatchType {
  EXACT_HASH = 'exact_hash',
  FUZZY_TITLE = 'fuzzy_title',
  TIME_MATCH = 'time_match',
  PARTICIPANT_MATCH = 'participant_match',
  COMBINED = 'combined',
  NONE = 'none',
}
