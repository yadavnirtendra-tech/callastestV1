// ============================================================
// Enterprise Calendar Sync — Immutable Audit Logger
// ============================================================
// Append-only audit log — records EVERYTHING.
// These records are NEVER updated or deleted.
// ============================================================

import getDatabase from '../database/client';
import { auditLogger } from '../utils/logger';
import { AuditAction, AuditResourceType, AuditSource } from '../types';

interface AuditEventParams {
  userId?: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
  source: AuditSource;
  metadata?: Record<string, unknown>;
}

/**
 * Write an immutable audit log entry.
 * This function NEVER throws — audit failures are logged but don't break the app.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const db = getDatabase();
    await db.auditLog.create({
      data: {
        userId: params.userId || null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        oldValue: (params.oldValue as any) || undefined,
        newValue: (params.newValue as any) || undefined,
        ipAddress: params.ipAddress || '0.0.0.0',
        userAgent: params.userAgent || 'system',
        source: params.source,
        metadata: (params.metadata as any) || {},
      },
    });

    auditLogger.debug({
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    }, 'Audit event recorded');
  } catch (error) {
    // Audit failures must NEVER crash the application
    auditLogger.error({ error, params: { action: params.action } }, 'Failed to write audit log');
  }
}

/**
 * Query audit logs with filtering and pagination.
 */
export async function queryAuditLogs(filters: {
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}) {
  const db = getDatabase();
  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 50, 100);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;
  if (filters.resourceType) where.resourceType = filters.resourceType;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  return { logs, total, page, limit, totalPages: Math.ceil(total / limit) };
}
