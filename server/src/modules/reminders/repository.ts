// The only code that touches reminder_settings, reminders and in_app_notifications (ADR-005).
// Every function takes userId first, except the ...System functions the tick uses across Users (Q-8).
import type { Db } from '../../shared/db';

export type ReminderRow = {
  event_id: string;
  user_id: string;
  title: string;
  date: string;
  time: string | null;
  lead_minutes: number | null;
  enabled: boolean;
  reminder_at: Date | null;
  status: 'scheduled' | 'none' | 'off' | 'sent' | 'late' | 'missed';
  delivered_at: Date | null;
};

const COLUMNS = `event_id, user_id, title, to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI') as time,
  lead_minutes, enabled, reminder_at, status, delivered_at`;

export async function getDefaultLead(db: Db, userId: string): Promise<number | undefined> {
  const res = await db.query<{ default_lead_minutes: number }>('select default_lead_minutes from reminder_settings where user_id = $1', [userId]);
  return res.rows[0]?.default_lead_minutes;
}

export async function setDefaultLead(db: Db, userId: string, minutes: number): Promise<void> {
  await db.query(
    `insert into reminder_settings (user_id, default_lead_minutes) values ($1, $2)
     on conflict (user_id) do update set default_lead_minutes = excluded.default_lead_minutes`,
    [userId, minutes],
  );
}

export async function getReminder(db: Db, userId: string, eventId: string, lock = false): Promise<ReminderRow | undefined> {
  const res = await db.query<ReminderRow>(`select ${COLUMNS} from reminders where user_id = $1 and event_id = $2${lock ? ' for update' : ''}`, [userId, eventId]);
  return res.rows[0];
}

export async function listReminders(db: Db, userId: string, eventIds: string[]): Promise<ReminderRow[]> {
  const res = await db.query<ReminderRow>(`select ${COLUMNS} from reminders where user_id = $1 and event_id = any($2::uuid[])`, [userId, eventIds]);
  return res.rows;
}

/** Reminders that follow the default Lead Time and have not been delivered (BR-19). */
export async function listOnDefault(db: Db, userId: string): Promise<ReminderRow[]> {
  const res = await db.query<ReminderRow>(
    `select ${COLUMNS} from reminders
      where user_id = $1 and lead_minutes is null and enabled and status in ('scheduled', 'none') for update`,
    [userId],
  );
  return res.rows;
}

/** Inserts the row; false when this Event already has one (a repeated EventConfirmed). */
export async function insertReminder(db: Db, userId: string, r: Omit<ReminderRow, 'user_id' | 'delivered_at'>): Promise<boolean> {
  const res = await db.query(
    `insert into reminders (event_id, user_id, title, date, time, lead_minutes, enabled, reminder_at, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (event_id) do nothing`,
    [r.event_id, userId, r.title, r.date, r.time, r.lead_minutes, r.enabled, r.reminder_at, r.status],
  );
  return res.rowCount === 1;
}

export async function updateReminder(db: Db, userId: string, r: Omit<ReminderRow, 'user_id'>): Promise<void> {
  await db.query(
    `update reminders set title = $3, date = $4, time = $5, lead_minutes = $6, enabled = $7,
            reminder_at = $8, status = $9, delivered_at = $10, updated_at = now()
      where user_id = $1 and event_id = $2`,
    [userId, r.event_id, r.title, r.date, r.time, r.lead_minutes, r.enabled, r.reminder_at, r.status, r.delivered_at],
  );
}

/** Removes the Reminder and its in-app notifications (architecture section 8: copies go on EventDeleted). */
export async function deleteReminder(db: Db, userId: string, eventId: string): Promise<void> {
  await db.query('delete from in_app_notifications where user_id = $1 and event_id = $2', [userId, eventId]);
  await db.query('delete from reminders where user_id = $1 and event_id = $2', [userId, eventId]);
}

export async function claimDueSystem(db: Db, now: Date, limit: number): Promise<ReminderRow[]> {
  const res = await db.query<ReminderRow>(
    `select ${COLUMNS} from reminders
      where status = 'scheduled' and reminder_at <= $1
      order by reminder_at limit $2 for update skip locked`,
    [now, limit],
  );
  return res.rows;
}

export async function markDeliveredSystem(db: Db, eventId: string, status: 'sent' | 'late' | 'missed', at: Date): Promise<void> {
  await db.query(`update reminders set status = $2, delivered_at = $3, updated_at = now() where event_id = $1 and status = 'scheduled'`, [eventId, status, at]);
}

export async function insertNotificationSystem(db: Db, r: ReminderRow, kind: 'due' | 'late' | 'missed'): Promise<void> {
  await db.query(
    `insert into in_app_notifications (user_id, event_id, title, date, time, reminder_at, kind) values ($1, $2, $3, $4, $5, $6, $7)`,
    [r.user_id, r.event_id, r.title, r.date, r.time, r.reminder_at, kind],
  );
}

export type NotificationRow = {
  id: string;
  event_id: string;
  title: string;
  date: string;
  time: string | null;
  reminder_at: Date;
  kind: 'due' | 'late' | 'missed';
};

export async function listUnseen(db: Db, userId: string, since: Date): Promise<NotificationRow[]> {
  const res = await db.query<NotificationRow>(
    `select id, event_id, title, to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI') as time, reminder_at, kind
       from in_app_notifications
      where user_id = $1 and seen_at is null and created_at >= $2
      order by reminder_at`,
    [userId, since],
  );
  return res.rows;
}

export async function markSeen(db: Db, userId: string, id: string, at: Date): Promise<boolean> {
  const res = await db.query('update in_app_notifications set seen_at = coalesce(seen_at, $3) where user_id = $1 and id = $2', [userId, id, at]);
  return res.rowCount === 1;
}

export async function purgeNotificationsSystem(db: Db, before: Date): Promise<number> {
  const res = await db.query('delete from in_app_notifications where created_at < $1', [before]);
  return res.rowCount ?? 0;
}

/** AC-13.3: the User's Reminders (with their copies of Event details), Lead Time setting and in-app notifications. */
export async function deleteAllForUser(db: Db, userId: string): Promise<void> {
  await db.query('delete from reminders where user_id = $1', [userId]);
  await db.query('delete from reminder_settings where user_id = $1', [userId]);
  await db.query('delete from in_app_notifications where user_id = $1', [userId]);
}
