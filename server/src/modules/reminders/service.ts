// Reminders (FR-09 in-app part, FR-10): Lead Time, the Reminder schedule (BR-07, BR-08, BR-19) and delivery with the NFR-03 record.
// Event changes arrive only through outbox messages (ADR-002); this module never changes Events.
import type { Pool } from 'pg';
import type { EventSnapshot, OutboxMessage } from '../../shared/contracts/outbox';
import { withTransaction, type Db } from '../../shared/db';
import { eventStart, startOfMinute } from '../../shared/time';
import type * as jobs from '../jobs';
import * as repo from './repository';

export const LEAD_MINUTES = [10, 30, 60, 1440] as const;
export const DEFAULT_LEAD = 30; // BR-07
const MINUTE = 60_000;
const LATE_AFTER = MINUTE; // NFR-03 window: no later than 1 minute after the Reminder Time
const MISSED_AFTER = 10 * MINUTE; // Q-23
const isLead = (v: unknown): v is number => LEAD_MINUTES.includes(v as (typeof LEAD_MINUTES)[number]);

/** GL-20 and BR-07: start minus Lead Time; an All-day Event uses 09:00 PKT. */
export function reminderTime(date: string, time: string | null, leadMinutes: number): Date {
  return new Date(eventStart(date, time ?? '09:00').getTime() - leadMinutes * MINUTE);
}

type Plan = Pick<repo.ReminderRow, 'reminder_at' | 'status' | 'delivered_at'>;

/** BR-08: no Reminder when its time is already before the minute of `at` (the confirm, edit or settings change). */
function plan(r: Pick<repo.ReminderRow, 'date' | 'time' | 'lead_minutes' | 'enabled'>, defaultLead: number, at: Date): Plan {
  if (!r.enabled) return { reminder_at: null, status: 'off', delivered_at: null };
  const reminderAt = reminderTime(r.date, r.time, r.lead_minutes ?? defaultLead);
  return { reminder_at: reminderAt, status: reminderAt < startOfMinute(at) ? 'none' : 'scheduled', delivered_at: null };
}

const defaultLead = async (db: Db, userId: string) => (await repo.getDefaultLead(db, userId)) ?? DEFAULT_LEAD;

// ---- Outbox subscribers ----

async function onConfirmed(tx: Db, e: EventSnapshot): Promise<void> {
  const base = { event_id: e.eventId, title: e.title, date: e.date, time: e.time, lead_minutes: null, enabled: true };
  await repo.insertReminder(tx, e.userId, { ...base, ...plan(base, await defaultLead(tx, e.userId), new Date(e.at)) });
}

/** AC-12.1: a new date or time moves the Reminder; a title or place change alone keeps its state. */
async function onUpdated(tx: Db, e: EventSnapshot): Promise<void> {
  const row = await repo.getReminder(tx, e.userId, e.eventId, true);
  if (!row) return onConfirmed(tx, e); // Confirmed before S07, so it had no Reminder yet
  const next = { ...row, title: e.title, date: e.date, time: e.time };
  const moved = row.date !== e.date || row.time !== e.time;
  await repo.updateReminder(tx, e.userId, moved ? { ...next, ...plan(next, await defaultLead(tx, e.userId), new Date(e.at)) } : next);
}

export async function onMessage(tx: Db, message: OutboxMessage): Promise<void> {
  if (message.type === 'EventConfirmed') await onConfirmed(tx, message.payload);
  else if (message.type === 'EventUpdated') await onUpdated(tx, message.payload);
  else await repo.deleteReminder(tx, message.payload.userId, message.payload.eventId); // AC-09.2
}

// ---- Delivery (tick task) ----

/**
 * Presents every due Reminder in the app (FR-09, C-05) and records when (NFR-03).
 * Up to 1 minute after the Reminder Time is on time, up to 10 minutes is late, later is missed (Q-23).
 */
export async function deliverDue(db: Pool, now: Date): Promise<number> {
  return withTransaction(db, async (tx) => {
    const due = await repo.claimDueSystem(tx, now, 200);
    for (const r of due) {
      const lateBy = now.getTime() - r.reminder_at!.getTime();
      const kind = lateBy <= LATE_AFTER ? 'due' : lateBy <= MISSED_AFTER ? 'late' : 'missed';
      await repo.markDeliveredSystem(tx, r.event_id, kind === 'due' ? 'sent' : kind, now);
      await repo.insertNotificationSystem(tx, r, kind);
    }
    return due.length;
  });
}

// ---- Settings and per-Event Reminder (FR-10) ----

export type Invalid = { invalid: Record<string, string> };
const LEAD_ERROR = 'Choose 10 minutes, 30 minutes, 1 hour or 1 day.';

export async function getSettings(db: Db, userId: string): Promise<{ defaultLeadMinutes: number }> {
  return { defaultLeadMinutes: await defaultLead(db, userId) };
}

/** BR-19 and Q-28: every undelivered Reminder on the default moves; Reminders with their own Lead Time keep it. */
export async function setDefaultLeadTime(db: Pool, userId: string, input: { defaultLeadMinutes?: unknown }, now: Date): Promise<{ defaultLeadMinutes: number } | Invalid> {
  const minutes = input.defaultLeadMinutes;
  if (!isLead(minutes)) return { invalid: { defaultLeadMinutes: LEAD_ERROR } };
  return withTransaction(db, async (tx) => {
    await repo.setDefaultLead(tx, userId, minutes);
    for (const row of await repo.listOnDefault(tx, userId)) await repo.updateReminder(tx, userId, { ...row, ...plan(row, minutes, now) });
    return { defaultLeadMinutes: minutes };
  });
}

export type ReminderState = {
  eventId: string;
  leadMinutes: number | null; // null: the default
  defaultLeadMinutes: number;
  enabled: boolean;
  reminderAt: string | null;
  status: repo.ReminderRow['status'];
};

const stateOf = (r: repo.ReminderRow, defaultLeadMinutes: number): ReminderState => ({
  eventId: r.event_id,
  leadMinutes: r.lead_minutes,
  defaultLeadMinutes,
  enabled: r.enabled,
  reminderAt: r.reminder_at?.toISOString() ?? null,
  status: r.status,
});

/** AC-10.2: turn one Event's Reminder off or on, or give it its own Lead Time (null goes back to the default). */
export async function setEventReminder(
  db: Pool,
  userId: string,
  eventId: string,
  input: { leadMinutes?: unknown; enabled?: unknown },
  now: Date,
): Promise<ReminderState | Invalid | undefined> {
  const invalid: Record<string, string> = {};
  if (input.leadMinutes !== undefined && input.leadMinutes !== null && !isLead(input.leadMinutes)) invalid.leadMinutes = LEAD_ERROR;
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') invalid.enabled = 'Choose on or off.';
  if (Object.keys(invalid).length) return { invalid };
  return withTransaction(db, async (tx) => {
    const row = await repo.getReminder(tx, userId, eventId, true);
    if (!row) return undefined;
    const next = {
      ...row,
      lead_minutes: input.leadMinutes === undefined ? row.lead_minutes : (input.leadMinutes as number | null),
      enabled: input.enabled === undefined ? row.enabled : (input.enabled as boolean),
    };
    const lead = await defaultLead(tx, userId);
    const updated = { ...next, ...plan(next, lead, now) };
    await repo.updateReminder(tx, userId, updated);
    return stateOf(updated, lead);
  });
}

/** Read model for the events endpoints (architecture 6.1 exception). */
export async function getReminderStates(db: Db, userId: string, eventIds: string[]): Promise<Record<string, ReminderState>> {
  if (eventIds.length === 0) return {};
  const lead = await defaultLead(db, userId);
  return Object.fromEntries((await repo.listReminders(db, userId, eventIds)).map((r) => [r.event_id, stateOf(r, lead)]));
}

// ---- In-app notifications (AC-09.3) ----

export type NotificationView = { id: string; eventId: string; title: string; date: string; time: string | null; reminderAt: string; kind: 'due' | 'late' | 'missed' };

const WEEK = 7 * 24 * 60 * MINUTE;

export async function listInApp(db: Db, userId: string, now: Date): Promise<NotificationView[]> {
  return (await repo.listUnseen(db, userId, new Date(now.getTime() - WEEK))).map((n) => ({
    id: n.id,
    eventId: n.event_id,
    title: n.title,
    date: n.date,
    time: n.time,
    reminderAt: n.reminder_at.toISOString(),
    kind: n.kind,
  }));
}

export const markSeen = (db: Db, userId: string, id: string, now: Date) => repo.markSeen(db, userId, id, now);

/** Called once by the composition root (Q-1). */
export function register(registry: jobs.Registry): void {
  registry.subscribe('EventConfirmed', 'reminders', (tx, m) => onMessage(tx, m));
  registry.subscribe('EventUpdated', 'reminders', (tx, m) => onMessage(tx, m));
  registry.subscribe('EventDeleted', 'reminders', (tx, m) => onMessage(tx, m));
  registry.registerTickTask('reminders.deliverDue', deliverDue);
  registry.registerTickTask('reminders.purgeNotifications', (db, now) => repo.purgeNotificationsSystem(db, new Date(now.getTime() - WEEK)));
}
