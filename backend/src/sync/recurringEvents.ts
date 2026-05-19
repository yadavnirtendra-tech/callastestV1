// ============================================================
// Enterprise Calendar Sync — Recurring Event Converter
// ============================================================
// Converts between Google's RRULE string format (RFC 5545)
// and Microsoft Graph's recurrence pattern JSON format.
// ============================================================

export interface CanonicalRecurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byDay?: string[];      // ['MO','WE','FR']
  byMonthDay?: number;   // 15 = 15th of month
  byMonth?: number;      // 1-12
  count?: number;        // end after N occurrences
  until?: string;        // end date ISO string
}

// ---- Google → Canonical ----

export function googleRruleToCanonical(rrules: string[]): CanonicalRecurrence | null {
  const rrule = rrules.find(r => r.startsWith('RRULE:'));
  if (!rrule) return null;

  const parts = Object.fromEntries(
    rrule.replace('RRULE:', '').split(';').map(p => p.split('=') as [string, string])
  );

  const freq = (parts['FREQ'] || 'DAILY').toLowerCase() as CanonicalRecurrence['frequency'];

  return {
    frequency: freq,
    interval: parts['INTERVAL'] ? parseInt(parts['INTERVAL']) : 1,
    byDay: parts['BYDAY'] ? parts['BYDAY'].split(',') : undefined,
    byMonthDay: parts['BYMONTHDAY'] ? parseInt(parts['BYMONTHDAY']) : undefined,
    byMonth: parts['BYMONTH'] ? parseInt(parts['BYMONTH']) : undefined,
    count: parts['COUNT'] ? parseInt(parts['COUNT']) : undefined,
    until: parts['UNTIL'] ? parseRruleDate(parts['UNTIL']) : undefined,
  };
}

// ---- Canonical → Google ----

export function canonicalToGoogleRrule(rec: CanonicalRecurrence): string[] {
  const parts: string[] = [`FREQ=${rec.frequency.toUpperCase()}`];

  if (rec.interval && rec.interval > 1) parts.push(`INTERVAL=${rec.interval}`);
  if (rec.byDay?.length) parts.push(`BYDAY=${rec.byDay.join(',')}`);
  if (rec.byMonthDay) parts.push(`BYMONTHDAY=${rec.byMonthDay}`);
  if (rec.byMonth) parts.push(`BYMONTH=${rec.byMonth}`);
  if (rec.count) parts.push(`COUNT=${rec.count}`);
  if (rec.until) parts.push(`UNTIL=${formatRruleDate(rec.until)}`);

  return [`RRULE:${parts.join(';')}`];
}

// ---- Microsoft → Canonical ----

export function microsoftRecurrenceToCanonical(msRec: any): CanonicalRecurrence | null {
  if (!msRec?.pattern) return null;

  const { pattern, range } = msRec;
  const typeMap: Record<string, CanonicalRecurrence['frequency']> = {
    daily: 'daily',
    weekly: 'weekly',
    absoluteMonthly: 'monthly',
    relativeMonthly: 'monthly',
    absoluteYearly: 'yearly',
    relativeYearly: 'yearly',
  };

  const rec: CanonicalRecurrence = {
    frequency: typeMap[pattern.type] || 'weekly',
    interval: pattern.interval || 1,
  };

  if (pattern.daysOfWeek?.length) {
    rec.byDay = pattern.daysOfWeek.map((d: string) => d.substring(0, 2).toUpperCase());
  }

  if (pattern.dayOfMonth) rec.byMonthDay = pattern.dayOfMonth;
  if (pattern.month) rec.byMonth = pattern.month;

  if (range) {
    if (range.type === 'numbered') rec.count = range.numberOfOccurrences;
    if (range.type === 'endDate') rec.until = range.endDate;
  }

  return rec;
}

// ---- Canonical → Microsoft ----

export function canonicalToMicrosoftRecurrence(rec: CanonicalRecurrence): any {
  const typeMap: Record<string, string> = {
    daily: 'daily',
    weekly: 'weekly',
    monthly: rec.byDay?.length ? 'relativeMonthly' : 'absoluteMonthly',
    yearly: rec.byDay?.length ? 'relativeYearly' : 'absoluteYearly',
  };

  const pattern: any = {
    type: typeMap[rec.frequency],
    interval: rec.interval,
  };

  if (rec.byDay?.length) {
    pattern.daysOfWeek = rec.byDay.map(d => expandDayCode(d));
  }

  if (rec.byMonthDay) pattern.dayOfMonth = rec.byMonthDay;
  if (rec.byMonth) pattern.month = rec.byMonth;

  let range: any;
  if (rec.count) {
    range = { type: 'numbered', numberOfOccurrences: rec.count, startDate: new Date().toISOString().split('T')[0] };
  } else if (rec.until) {
    range = { type: 'endDate', endDate: rec.until.split('T')[0], startDate: new Date().toISOString().split('T')[0] };
  } else {
    range = { type: 'noEnd', startDate: new Date().toISOString().split('T')[0] };
  }

  return { pattern, range };
}

// ---- Helpers ----

function parseRruleDate(rruleDate: string): string {
  // RRULE dates: 20241231T000000Z → 2024-12-31
  if (rruleDate.includes('T')) {
    return new Date(
      rruleDate.replace(/(\d{4})(\d{2})(\d{2})T.*/, '$1-$2-$3')
    ).toISOString();
  }
  return new Date(
    rruleDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
  ).toISOString();
}

function formatRruleDate(isoDate: string): string {
  return isoDate.replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function expandDayCode(code: string): string {
  const map: Record<string, string> = {
    MO: 'monday', TU: 'tuesday', WE: 'wednesday',
    TH: 'thursday', FR: 'friday', SA: 'saturday', SU: 'sunday',
  };
  return map[code] || code.toLowerCase();
}
