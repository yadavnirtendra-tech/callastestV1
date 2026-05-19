// ============================================================
// Enterprise Calendar Sync — Zod Validators
// ============================================================

import { z } from 'zod';

export const emailSchema = z.string().email().max(255);

export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
}).refine(data => data.startDate < data.endDate, {
  message: 'startDate must be before endDate',
});

export const webhookGoogleSchema = z.object({
  'x-goog-channel-id': z.string(),
  'x-goog-resource-id': z.string(),
  'x-goog-resource-state': z.string(),
  'x-goog-channel-token': z.string().optional(),
});

export const webhookMicrosoftSchema = z.object({
  value: z.array(z.object({
    subscriptionId: z.string(),
    changeType: z.string(),
    resource: z.string(),
    clientState: z.string().optional(),
    tenantId: z.string().optional(),
  })),
});
