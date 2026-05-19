// ============================================================
// Enterprise Calendar Sync — Date & Timezone Utilities
// ============================================================

/**
 * Convert a date to a specific timezone-aware ISO string.
 */
export function toTimezoneISO(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', { timeZone: timezone });
}

/**
 * Check if two time ranges overlap.
 * Used for conflict detection.
 */
export function hasTimeOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Calculate overlap duration in minutes between two time ranges.
 */
export function getOverlapMinutes(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): number {
  if (!hasTimeOverlap(start1, end1, start2, end2)) return 0;

  const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
  const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
  return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60));
}

/**
 * Get the start of day in a specific timezone.
 */
export function startOfDayInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

/**
 * Get the end of day in a specific timezone.
 */
export function endOfDayInTimezone(date: Date, timezone: string): Date {
  const start = startOfDayInTimezone(date, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Check if a date falls within business hours (9 AM - 6 PM).
 */
export function isBusinessHours(date: Date, timezone: string): boolean {
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
    10
  );
  return hour >= 9 && hour < 18;
}

/**
 * Add minutes to a date.
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Get a human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Parse an ISO date string safely — returns null on failure (never throws).
 */
export function safeParseDate(input: string | Date | undefined | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const date = new Date(input);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get time window for availability check (default: next 24 hours).
 */
export function getAvailabilityWindow(startDate?: Date, hours: number = 24): { start: Date; end: Date } {
  const start = startDate || new Date();
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  return { start, end };
}
