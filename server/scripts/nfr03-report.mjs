/* global console, process */
// NFR-03 report (S13-3): each Reminder of one account, its Reminder Time, and when its in-app
// notification was written (the real presentation time; reminders.delivered_at is the tick's start).
// Usage, from server/: DATABASE_URL=... node scripts/nfr03-report.mjs <email>
import pg from 'pg';

const email = process.argv[2];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(
  `select r.title, r.reminder_at, r.status, n.created_at as presented_at
     from reminders r
     join users u on u.id = r.user_id
     left join in_app_notifications n on n.user_id = r.user_id and n.event_id = r.event_id
    where u.email = $1
    order by r.reminder_at`,
  [email],
);
await client.end();

let onTime = 0;
console.log('| Reminder | Reminder Time (UTC) | Status | Presented (UTC) | Late by (s) | Within 0 to 60 s |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  const late = r.presented_at ? (r.presented_at - r.reminder_at) / 1000 : null;
  const ok = late !== null && late >= 0 && late <= 60;
  if (ok) onTime++;
  console.log(`| ${r.title} | ${r.reminder_at.toISOString()} | ${r.status} | ${r.presented_at?.toISOString() ?? '-'} | ${late?.toFixed(1) ?? '-'} | ${ok ? 'yes' : 'no'} |`);
}
const lates = rows.filter((r) => r.presented_at).map((r) => (r.presented_at - r.reminder_at) / 1000).sort((a, b) => a - b);
console.log(`\n${onTime} of ${rows.length} on time (${((onTime / Math.max(rows.length, 1)) * 100).toFixed(1)}%); NFR-03 needs at least 98%.`);
if (lates.length) console.log(`Late by: min ${lates[0].toFixed(1)} s, median ${lates[Math.floor(lates.length / 2)].toFixed(1)} s, max ${lates.at(-1).toFixed(1)} s.`);
