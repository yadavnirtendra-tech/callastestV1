import { describe, it, expect, vi, beforeEach } from 'vitest';

// Setup environment variables before imports
process.env.ENCRYPTION_KEY = '5621371fe78531e25dbff03dac041818c36c42e533e060bb79c16ca99097a6b6';
process.env.NODE_ENV = 'test';

import { checkForConflicts } from '../conflict/detector';
import { encrypt } from '../crypto/encryption';

// Mock database
const mockPrisma = {
  event: {
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  calendar: {
    findFirst: vi.fn(),
  },
};

vi.mock('../database/client', () => {
  return {
    default: () => mockPrisma,
    getDatabase: () => mockPrisma,
  };
});

// Mock connectors to prevent actual HTTP requests
vi.mock('../connectors/google/calendar', () => ({
  getGoogleFreeBusy: vi.fn().mockResolvedValue([]),
}));
vi.mock('../connectors/microsoft/calendar', () => ({
  getMicrosoftFreeBusy: vi.fn().mockResolvedValue([]),
}));

describe('checkForConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      googleConnected: false,
      microsoftConnected: false,
    });
  });

  it('returns no conflicts if no overlapping events exist', async () => {
    mockPrisma.event.findMany.mockResolvedValue([]);
    const result = await checkForConflicts('user-1', new Date('2026-06-01T10:00:00Z'), new Date('2026-06-01T11:00:00Z'));
    expect(result.hasConflict).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it('correctly decrypts the event title for time overlap conflicts', async () => {
    const encryptedTitle = encrypt('Sync Project Planning');
    mockPrisma.event.findMany
      .mockResolvedValueOnce([
        {
          id: 'event-1',
          title: encryptedTitle,
          startTime: new Date('2026-06-01T09:30:00Z'),
          endTime: new Date('2026-06-01T10:30:00Z'),
          organizerEmail: 'organizer@example.com',
          status: 'CONFIRMED',
          showAs: 'BUSY',
          calendar: { provider: 'GOOGLE' },
        },
      ]) // Check 1
      .mockResolvedValueOnce([]) // Check 3 OOF
      .mockResolvedValueOnce([]); // Check 4 Focus Time

    const result = await checkForConflicts('user-1', new Date('2026-06-01T10:00:00Z'), new Date('2026-06-01T11:00:00Z'));
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].existingEvent.title).toBe('Sync Project Planning');
  });

  it('correctly decrypts the event title for Out-of-Office (OOF) conflicts', async () => {
    const encryptedTitle = encrypt('Vacation Day');
    mockPrisma.event.findMany
      .mockResolvedValueOnce([]) // Check 1
      .mockResolvedValueOnce([   // Check 3
        {
          id: 'event-2',
          title: encryptedTitle,
          startTime: new Date('2026-06-01T08:00:00Z'),
          endTime: new Date('2026-06-01T17:00:00Z'),
          organizerEmail: 'user@example.com',
          status: 'CONFIRMED',
          showAs: 'OOF',
          sourcePlatform: 'GOOGLE',
        },
      ])
      .mockResolvedValueOnce([]); // Check 4 Focus Time

    const result = await checkForConflicts('user-1', new Date('2026-06-01T10:00:00Z'), new Date('2026-06-01T11:00:00Z'));
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].existingEvent.title).toBe('Vacation Day');
    expect(result.conflicts[0].existingEvent.status).toBe('oof');
  });

  it('successfully identifies Focus Time violations even when the title is GCM-encrypted', async () => {
    const encryptedFocusTitle = encrypt('Personal Focus Time');
    
    mockPrisma.event.findMany
      .mockResolvedValueOnce([]) // Check 1
      .mockResolvedValueOnce([]) // Check 3 OOF
      .mockResolvedValueOnce([   // Check 4 Focus Time
        {
          id: 'event-3',
          title: encryptedFocusTitle,
          startTime: new Date('2026-06-01T09:00:00Z'),
          endTime: new Date('2026-06-01T12:00:00Z'),
          organizerEmail: 'user@example.com',
          status: 'CONFIRMED',
          showAs: 'FREE',
          sourcePlatform: 'GOOGLE',
        },
      ]);

    const result = await checkForConflicts('user-1', new Date('2026-06-01T10:00:00Z'), new Date('2026-06-01T11:00:00Z'));
    expect(result.hasConflict).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].existingEvent.title).toBe('Personal Focus Time');
    expect(result.conflicts[0].existingEvent.status).toBe('focus');
  });
});
