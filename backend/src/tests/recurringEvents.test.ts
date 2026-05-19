import { describe, it, expect } from 'vitest';
import {
  googleRruleToCanonical,
  canonicalToGoogleRrule,
  microsoftRecurrenceToCanonical,
  canonicalToMicrosoftRecurrence,
} from '../sync/recurringEvents';

describe('googleRruleToCanonical', () => {
  it('parses weekly Monday/Wednesday/Friday rule', () => {
    const result = googleRruleToCanonical(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR']);
    expect(result?.frequency).toBe('weekly');
    expect(result?.byDay).toEqual(['MO', 'WE', 'FR']);
    expect(result?.interval).toBe(1);
  });

  it('parses daily with interval', () => {
    const result = googleRruleToCanonical(['RRULE:FREQ=DAILY;INTERVAL=2']);
    expect(result?.frequency).toBe('daily');
    expect(result?.interval).toBe(2);
  });

  it('parses monthly with count', () => {
    const result = googleRruleToCanonical(['RRULE:FREQ=MONTHLY;COUNT=12;BYMONTHDAY=15']);
    expect(result?.frequency).toBe('monthly');
    expect(result?.count).toBe(12);
    expect(result?.byMonthDay).toBe(15);
  });

  it('returns null for empty array', () => {
    expect(googleRruleToCanonical([])).toBeNull();
  });
});

describe('canonicalToGoogleRrule', () => {
  it('converts weekly rule back to RRULE string', () => {
    const rules = canonicalToGoogleRrule({
      frequency: 'weekly',
      interval: 1,
      byDay: ['MO', 'FR'],
    });
    expect(rules[0]).toContain('FREQ=WEEKLY');
    expect(rules[0]).toContain('BYDAY=MO,FR');
  });

  it('round-trips through canonical format', () => {
    const original = ['RRULE:FREQ=WEEKLY;BYDAY=TU,TH;INTERVAL=2'];
    const canonical = googleRruleToCanonical(original)!;
    const back = canonicalToGoogleRrule(canonical);
    const reparsed = googleRruleToCanonical(back)!;
    expect(reparsed.frequency).toBe(canonical.frequency);
    expect(reparsed.byDay).toEqual(canonical.byDay);
    expect(reparsed.interval).toBe(canonical.interval);
  });
});

describe('microsoftRecurrenceToCanonical', () => {
  it('converts weekly MS pattern', () => {
    const msRec = {
      pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday', 'wednesday'] },
      range: { type: 'noEnd', startDate: '2024-01-01' },
    };
    const result = microsoftRecurrenceToCanonical(msRec);
    expect(result?.frequency).toBe('weekly');
    expect(result?.byDay).toEqual(['MO', 'WE']);
  });

  it('handles numbered range', () => {
    const msRec = {
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'numbered', numberOfOccurrences: 10, startDate: '2024-01-01' },
    };
    const result = microsoftRecurrenceToCanonical(msRec);
    expect(result?.count).toBe(10);
  });

  it('returns null for null input', () => {
    expect(microsoftRecurrenceToCanonical(null)).toBeNull();
  });
});

describe('canonicalToMicrosoftRecurrence', () => {
  it('converts weekly canonical to MS pattern', () => {
    const result = canonicalToMicrosoftRecurrence({
      frequency: 'weekly',
      interval: 1,
      byDay: ['MO', 'WE', 'FR'],
    });
    expect(result.pattern.type).toBe('weekly');
    expect(result.pattern.daysOfWeek).toContain('monday');
    expect(result.pattern.daysOfWeek).toContain('wednesday');
  });

  it('produces noEnd range when no count or until', () => {
    const result = canonicalToMicrosoftRecurrence({ frequency: 'daily', interval: 1 });
    expect(result.range.type).toBe('noEnd');
  });
});
