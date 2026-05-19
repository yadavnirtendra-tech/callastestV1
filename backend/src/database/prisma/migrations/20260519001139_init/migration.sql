-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIEWER');

-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'CONFIDENTIAL', 'DEFAULT');

-- CreateEnum
CREATE TYPE "ShowAs" AS ENUM ('FREE', 'BUSY', 'TENTATIVE', 'OOF', 'WORKING_ELSEWHERE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SyncState" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'CONFLICT', 'ERROR', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConflictState" AS ENUM ('NONE', 'DETECTED', 'RESOLVED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "SyncDirection" AS ENUM ('GOOGLE_TO_OUTLOOK', 'OUTLOOK_TO_GOOGLE');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACCEPT', 'DECLINE', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "SyncTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING', 'DEAD_LETTER', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConflictType" AS ENUM ('TIME_OVERLAP', 'DOUBLE_BOOKING', 'VERSION_CONFLICT', 'RECURRING_OVERLAP', 'FOCUS_TIME_VIOLATION', 'OUT_OF_OFFICE_CONFLICT');

-- CreateEnum
CREATE TYPE "ConflictResolution" AS ENUM ('AUTO_REJECTED', 'ADMIN_OVERRIDE', 'LATEST_WINS', 'SOURCE_PRIORITY', 'ORGANIZER_PRIORITY', 'MANUAL');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiresAt" TIMESTAMP(3),
    "microsoftAccessToken" TEXT,
    "microsoftRefreshToken" TEXT,
    "microsoftTokenExpiresAt" TIMESTAMP(3),
    "googleConnected" BOOLEAN NOT NULL DEFAULT false,
    "microsoftConnected" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendars" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "externalCalendarId" VARCHAR(500) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "syncToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "globalEventUuid" VARCHAR(100) NOT NULL,
    "sourcePlatform" "Provider" NOT NULL,
    "sourceEventId" VARCHAR(500) NOT NULL,
    "mirrorEventId" VARCHAR(500),
    "mirrorPlatform" "Provider",
    "syncFingerprint" VARCHAR(128) NOT NULL,
    "idempotencyKey" VARCHAR(200) NOT NULL,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "startTime" TIMESTAMPTZ NOT NULL,
    "endTime" TIMESTAMPTZ NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL DEFAULT '',
    "status" "EventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'DEFAULT',
    "showAs" "ShowAs" NOT NULL DEFAULT 'BUSY',
    "organizerEmail" VARCHAR(255) NOT NULL,
    "organizerName" VARCHAR(255) NOT NULL DEFAULT '',
    "isOrganizer" BOOLEAN NOT NULL DEFAULT false,
    "attendees" JSONB NOT NULL DEFAULT '[]',
    "recurrenceRule" JSONB,
    "recurringEventId" VARCHAR(500),
    "isRecurringInstance" BOOLEAN NOT NULL DEFAULT false,
    "reminders" JSONB NOT NULL DEFAULT '[]',
    "meetingLink" TEXT NOT NULL DEFAULT '',
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "colorCategory" VARCHAR(50) NOT NULL DEFAULT '',
    "syncState" "SyncState" NOT NULL DEFAULT 'PENDING',
    "conflictState" "ConflictState" NOT NULL DEFAULT 'NONE',
    "originPlatform" "Provider" NOT NULL,
    "lastModifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastModifiedBy" VARCHAR(255) NOT NULL DEFAULT '',
    "etag" VARCHAR(255) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_transactions" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "transactionId" VARCHAR(100) NOT NULL,
    "direction" "SyncDirection" NOT NULL,
    "action" "SyncAction" NOT NULL,
    "status" "SyncTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "sourceEventId" VARCHAR(500) NOT NULL,
    "targetEventId" VARCHAR(500),
    "sourcePayload" JSONB NOT NULL DEFAULT '{}',
    "targetPayload" JSONB,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 5,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflict_logs" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "conflictType" "ConflictType" NOT NULL,
    "resolution" "ConflictResolution" NOT NULL,
    "conflictingEventData" JSONB NOT NULL,
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "notificationSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "userId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(50) NOT NULL,
    "resourceId" VARCHAR(255) NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" VARCHAR(45) NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "source" VARCHAR(20) NOT NULL DEFAULT 'system',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" UUID NOT NULL,
    "calendarId" UUID NOT NULL,
    "provider" "Provider" NOT NULL,
    "channelId" VARCHAR(255) NOT NULL,
    "resourceId" VARCHAR(500) NOT NULL DEFAULT '',
    "webhookUrl" TEXT NOT NULL,
    "clientState" VARCHAR(255) NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "calendars_userId_idx" ON "calendars"("userId");

-- CreateIndex
CREATE INDEX "calendars_provider_idx" ON "calendars"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "calendars_userId_provider_externalCalendarId_key" ON "calendars"("userId", "provider", "externalCalendarId");

-- CreateIndex
CREATE UNIQUE INDEX "events_globalEventUuid_key" ON "events"("globalEventUuid");

-- CreateIndex
CREATE UNIQUE INDEX "events_idempotencyKey_key" ON "events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "events_calendarId_idx" ON "events"("calendarId");

-- CreateIndex
CREATE INDEX "events_sourcePlatform_sourceEventId_idx" ON "events"("sourcePlatform", "sourceEventId");

-- CreateIndex
CREATE INDEX "events_mirrorPlatform_mirrorEventId_idx" ON "events"("mirrorPlatform", "mirrorEventId");

-- CreateIndex
CREATE INDEX "events_syncFingerprint_idx" ON "events"("syncFingerprint");

-- CreateIndex
CREATE INDEX "events_syncState_idx" ON "events"("syncState");

-- CreateIndex
CREATE INDEX "events_startTime_endTime_idx" ON "events"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "events_organizerEmail_idx" ON "events"("organizerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "sync_transactions_transactionId_key" ON "sync_transactions"("transactionId");

-- CreateIndex
CREATE INDEX "sync_transactions_eventId_idx" ON "sync_transactions"("eventId");

-- CreateIndex
CREATE INDEX "sync_transactions_status_idx" ON "sync_transactions"("status");

-- CreateIndex
CREATE INDEX "sync_transactions_direction_idx" ON "sync_transactions"("direction");

-- CreateIndex
CREATE INDEX "sync_transactions_createdAt_idx" ON "sync_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "conflict_logs_eventId_idx" ON "conflict_logs"("eventId");

-- CreateIndex
CREATE INDEX "conflict_logs_userId_idx" ON "conflict_logs"("userId");

-- CreateIndex
CREATE INDEX "conflict_logs_createdAt_idx" ON "conflict_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_subscriptions_channelId_key" ON "webhook_subscriptions"("channelId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_calendarId_idx" ON "webhook_subscriptions"("calendarId");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_provider_idx" ON "webhook_subscriptions"("provider");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_expiresAt_idx" ON "webhook_subscriptions"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_status_idx" ON "webhook_subscriptions"("status");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_transactions" ADD CONSTRAINT "sync_transactions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_logs" ADD CONSTRAINT "conflict_logs_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflict_logs" ADD CONSTRAINT "conflict_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "calendars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
