// ============================================================
// Enterprise Calendar Sync — Common Types
// ============================================================

/** Audit log entry — immutable once written */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string;
  userAgent: string;
  source: AuditSource;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export enum AuditAction {
  // Auth
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  
  // Events
  EVENT_CREATED = 'event_created',
  EVENT_UPDATED = 'event_updated',
  EVENT_DELETED = 'event_deleted',
  EVENT_ACCEPTED = 'event_accepted',
  EVENT_DECLINED = 'event_declined',
  
  // Sync
  SYNC_STARTED = 'sync_started',
  SYNC_COMPLETED = 'sync_completed',
  SYNC_FAILED = 'sync_failed',
  SYNC_SKIPPED = 'sync_skipped',
  SYNC_LOOP_PREVENTED = 'sync_loop_prevented',
  
  // Conflicts
  CONFLICT_DETECTED = 'conflict_detected',
  CONFLICT_RESOLVED = 'conflict_resolved',
  INVITE_AUTO_REJECTED = 'invite_auto_rejected',
  
  // Webhooks
  WEBHOOK_RECEIVED = 'webhook_received',
  WEBHOOK_VALIDATED = 'webhook_validated',
  WEBHOOK_INVALID = 'webhook_invalid',
  WEBHOOK_SUBSCRIPTION_CREATED = 'webhook_subscription_created',
  WEBHOOK_SUBSCRIPTION_RENEWED = 'webhook_subscription_renewed',
  
  // Admin
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DEACTIVATED = 'user_deactivated',
  ADMIN_OVERRIDE = 'admin_override',
  SETTINGS_CHANGED = 'settings_changed',
  
  // Security
  RATE_LIMIT_HIT = 'rate_limit_hit',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
}

export enum AuditResourceType {
  USER = 'user',
  EVENT = 'event',
  CALENDAR = 'calendar',
  SYNC_TRANSACTION = 'sync_transaction',
  WEBHOOK = 'webhook',
  CONFLICT = 'conflict',
  NOTIFICATION = 'notification',
  SYSTEM = 'system',
}

export enum AuditSource {
  SYSTEM = 'system',
  USER = 'user',
  WEBHOOK = 'webhook',
  ADMIN = 'admin',
  SCHEDULER = 'scheduler',
}

/** Notification record */
export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject: string;
  body: string;
  status: NotificationStatus;
  metadata: Record<string, unknown>;
  sentAt: Date | null;
  createdAt: Date;
}

export enum NotificationType {
  REJECTION = 'rejection',
  CONFLICT_ALERT = 'conflict_alert',
  SYNC_FAILURE = 'sync_failure',
  ADMIN_ALERT = 'admin_alert',
  SECURITY_ALERT = 'security_alert',
  WELCOME = 'welcome',
}

export enum NotificationChannel {
  EMAIL = 'email',
  DASHBOARD = 'dashboard',
  BOTH = 'both',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

/** API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;
  };
}

/** Pagination parameters */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Health check response */
export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    googleApi: ServiceHealth;
    microsoftApi: ServiceHealth;
  };
  timestamp: string;
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  lastChecked: string;
  error?: string;
}
