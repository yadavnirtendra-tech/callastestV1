// ============================================================
// Enterprise Calendar Sync — Sync Types
// ============================================================

import { CalendarProvider, ConflictState, SyncState } from './events';

/** Represents a single sync transaction between platforms */
export interface SyncTransaction {
  id: string;
  eventId: string;
  transactionId: string;
  direction: SyncDirection;
  action: SyncAction;
  status: SyncTransactionStatus;
  sourceEventId: string;
  targetEventId: string | null;
  sourcePayload: Record<string, unknown>;
  targetPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetries: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export enum SyncDirection {
  GOOGLE_TO_OUTLOOK = 'google_to_outlook',
  OUTLOOK_TO_GOOGLE = 'outlook_to_google',
}

export enum SyncAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  ACCEPT = 'accept',
  DECLINE = 'decline',
  RESCHEDULE = 'reschedule',
}

export enum SyncTransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  DEAD_LETTER = 'dead_letter',
  SKIPPED = 'skipped',
}

/** Webhook payload from either provider */
export interface WebhookPayload {
  provider: CalendarProvider;
  channelId: string;
  resourceId: string;
  resourceState: string;
  subscriptionId?: string;
  changeType?: string;
  tenantId?: string;
  clientState?: string;
  rawHeaders: Record<string, string>;
  rawBody: string;
  receivedAt: Date;
}

/** Sync job to be queued in BullMQ */
export interface SyncJob {
  jobId: string;
  userId: string;
  calendarId: string;
  provider: CalendarProvider;
  webhook: WebhookPayload;
  priority: number;
  attempts: number;
  createdAt: Date;
}

/** Sync result returned after processing */
export interface SyncResult {
  transactionId: string;
  success: boolean;
  action: SyncAction;
  direction: SyncDirection;
  sourceEventId: string;
  targetEventId: string | null;
  syncState: SyncState;
  conflictState: ConflictState;
  skipped: boolean;
  skipReason?: string;
  error?: string;
  duration: number;
}

/** Webhook subscription record */
export interface WebhookSubscription {
  id: string;
  calendarId: string;
  provider: CalendarProvider;
  channelId: string;
  resourceId: string;
  webhookUrl: string;
  expiresAt: Date;
  status: 'active' | 'expired' | 'error';
  createdAt: Date;
  updatedAt: Date;
}

/** Sync fingerprint for loop prevention */
export interface SyncFingerprint {
  eventId: string;
  fingerprint: string;
  version: number;
  provider: CalendarProvider;
  lastUpdated: Date;
}

/** Dead letter entry for failed sync jobs */
export interface DeadLetterEntry {
  id: string;
  originalJobId: string;
  jobData: SyncJob;
  error: string;
  failedAt: Date;
  retryCount: number;
  lastRetryAt: Date | null;
  resolved: boolean;
}
