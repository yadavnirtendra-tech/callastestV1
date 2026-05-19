import { describe, it, expect } from 'vitest';
import { generateSyncFingerprint, isSyncLoop, generateIdempotencyKey } from '../sync/fingerprint';

const baseEvent = {
  sourceEventId: 'evt-123',
  title: 'Team Standup',
  startTime: new Date('2024-06-01T09:00:00Z'),
  endTime: new Date('2024-06-01T09:30:00Z'),
  organizerEmail: 'alice@example.com',
  calendarId: 'cal-abc',
};

describe('generateSyncFingerprint', () => {
  it('produces consistent hash for same event', () => {
    const a = generateSyncFingerprint(baseEvent as any);
    const b = generateSyncFingerprint(baseEvent as any);
    expect(a).toBe(b);
  });

  it('produces different hash when title changes', () => {
    const a = generateSyncFingerprint(baseEvent as any);
    const b = generateSyncFingerprint({ ...baseEvent, title: 'Different Title' } as any);
    expect(a).not.toBe(b);
  });

  it('produces different hash when time changes', () => {
    const a = generateSyncFingerprint(baseEvent as any);
    const b = generateSyncFingerprint({
      ...baseEvent,
      startTime: new Date('2024-06-01T10:00:00Z'),
    } as any);
    expect(a).not.toBe(b);
  });

  it('returns a 64-character hex string', () => {
    const fp = generateSyncFingerprint(baseEvent as any);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isSyncLoop', () => {
  it('detects a loop when fingerprints match', () => {
    const fp = generateSyncFingerprint(baseEvent as any);
    expect(isSyncLoop(fp, fp)).toBe(true);
  });

  it('returns false when fingerprints differ', () => {
    const fp1 = generateSyncFingerprint(baseEvent as any);
    const fp2 = generateSyncFingerprint({ ...baseEvent, title: 'Other' } as any);
    expect(isSyncLoop(fp1, fp2)).toBe(false);
  });

  it('returns false when stored fingerprint is null', () => {
    const fp = generateSyncFingerprint(baseEvent as any);
    expect(isSyncLoop(fp, null)).toBe(false);
  });
});

describe('generateIdempotencyKey', () => {
  it('produces unique keys for different actions', () => {
    const create = generateIdempotencyKey('GOOGLE', 'evt-1', 'create', 1);
    const update = generateIdempotencyKey('GOOGLE', 'evt-1', 'update', 2);
    expect(create).not.toBe(update);
  });

  it('produces the same key for identical inputs', () => {
    const a = generateIdempotencyKey('MICROSOFT', 'evt-2', 'delete', 1);
    const b = generateIdempotencyKey('MICROSOFT', 'evt-2', 'delete', 1);
    expect(a).toBe(b);
  });
});
