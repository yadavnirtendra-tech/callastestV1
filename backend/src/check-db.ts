import getDatabase from './database/client';

async function main() {
  const db = getDatabase();
  console.log("=== LATEST EVENT TIMING ===");
  const events = await db.event.findMany({
    take: 1,
    orderBy: { createdAt: 'desc' }
  });
  if (events.length > 0) {
    const e = events[0];
    console.log({
      id: e.id,
      title: e.title, // wait, this is encrypted
      startTime: e.startTime,
      endTime: e.endTime,
      timezone: e.timezone,
      createdAt: e.createdAt,
    });
  } else {
    console.log("No events found");
  }
}

main().catch(console.error);
