import getDatabase from './database/client';
import { decrypt } from './crypto/encryption';

async function main() {
  const db = getDatabase();
  console.log("=== USERS ===");
  const users = await db.user.findMany();
  for (const u of users) {
    console.log({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      googleConnected: u.googleConnected,
      microsoftConnected: u.microsoftConnected,
    });
  }

  console.log("\n=== CALENDARS ===");
  const calendars = await db.calendar.findMany();
  for (const c of calendars) {
    console.log({
      id: c.id,
      userId: c.userId,
      provider: c.provider,
      externalCalendarId: c.externalCalendarId,
      name: c.name,
      syncEnabled: c.syncEnabled,
    });
  }

  console.log("\n=== EVENTS ===");
  const events = await db.event.findMany({
    orderBy: { createdAt: 'desc' }
  });
  for (const e of events) {
    let title = e.title;
    try {
      title = decrypt(e.title);
    } catch (err) {}
    console.log({
      id: e.id,
      title,
      sourcePlatform: e.sourcePlatform,
      sourceEventId: e.sourceEventId,
      mirrorPlatform: e.mirrorPlatform,
      mirrorEventId: e.mirrorEventId,
      startTime: e.startTime,
      endTime: e.endTime,
      timezone: e.timezone,
      createdAt: e.createdAt,
    });
  }
}

main().catch(console.error);
