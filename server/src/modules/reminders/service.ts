// Reminders (FR-09, FR-10): Lead Time, the Reminder schedule (BR-07, BR-08, BR-19) and delivery in the app and by web push, with the NFR-03 record.
// Event changes arrive only through outbox messages (ADR-002); this module never changes Events.
import type { Pool } from 'pg';
import { sendNotification, WebPushError } from 'web-push';
import type { EventSnapshot, OutboxMessage } from '../../shared/contracts/outbox';
import { withTransaction, type Db } from '../../shared/db';
import { logError } from '../../shared/log';
import { eventStart, pktParts, startOfMinute } from '../../shared/time';
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
  else if (message.type === 'EventDeleted') await repo.deleteReminder(tx, message.payload.userId, message.payload.eventId); // AC-09.2
}

// ---- Delivery (tick task) ----

/**
 * Presents every due Reminder in the app (FR-09, C-05) and records when (NFR-03).
 * Up to 1 minute after the Reminder Time is on time, up to 10 minutes is late, later is missed (Q-23).
 */
export async function deliverDue(db: Pool, now: Date): Promise<number> {
  const toPush: repo.ReminderRow[] = [];
  const count = await withTransaction(db, async (tx) => {
    const due = await repo.claimDueSystem(tx, now, 200);
    for (const r of due) {
      const lateBy = now.getTime() - r.reminder_at!.getTime();
      const kind = lateBy <= LATE_AFTER ? 'due' : lateBy <= MISSED_AFTER ? 'late' : 'missed';
      await repo.markDeliveredSystem(tx, r.event_id, kind === 'due' ? 'sent' : kind, now);
      await repo.insertNotificationSystem(tx, r, kind);
      if (kind !== 'missed') toPush.push(r); // Q-23: a missed Reminder is shown in the app only
    }
    return due.length;
  });
  // After commit (S10 decision 6): a failed or slow push never undoes the in-app Reminder (AC-09.3, C-05).
  if (toPush.length) await pushAll(db, toPush, now).catch((err) => logError('reminders.push', err));
  return count;
}

// ---- Web push (S10) ----

/** One push attempt: the push service's status code, or 0 for a network error or timeout. */
export type PushSender = (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<number>;

const PUSH_TIMEOUT_MS = 5000;
const PUSH_TTL_S = 600; // Q-23: after 10 minutes a Reminder counts as missed, so the push service may drop it

function vapid() {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : undefined;
}

const webPushSender: PushSender = async (subscription, payload) => {
  try {
    return (await sendNotification(subscription, payload, { vapidDetails: vapid(), TTL: PUSH_TTL_S, urgency: 'high', timeout: PUSH_TIMEOUT_MS })).statusCode;
  } catch (err) {
    return err instanceof WebPushError ? err.statusCode : 0;
  }
};

let testSender: PushSender | undefined;
/** Test seam: replaces the push service. Not exported from the module's index. */
export function setPushSender(sender: PushSender | undefined): void {
  testSender = sender;
}

const sender = (): PushSender | undefined => testSender ?? (vapid() ? webPushSender : undefined);

export const pushPublicKey = (): string | undefined => vapid()?.publicKey;

/** The same words as the in-app Reminder card (ui-direction.md): "Aaj, 5:00 pm", "Kal, All day", "Parson, ..." or "Fri 27 Nov, 5:00 pm", in PKT. */
export function whenText(date: string, time: string | null, now: Date): string {
  const near = ['Aaj', 'Kal', 'Parson'][[0, 1, 2].findIndex((n) => pktParts(new Date(now.getTime() + n * 24 * 60 * MINUTE)).date === date)];
  const [y, m, d] = date.split('-').map(Number);
  const day = near ?? new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  if (!time) return `${day}, All day`;
  const [h, min] = time.split(':').map(Number);
  return `${day}, ${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** S10 decision 3(a): the title and time. The phone's own lock-screen settings decide whether they show (MF-05). */
const payloadOf = (r: repo.ReminderRow, now: Date) => JSON.stringify({ title: r.title, body: whenText(r.date, r.time, now), tag: r.event_id, url: '/' });

async function pushAll(db: Pool, rows: repo.ReminderRow[], now: Date): Promise<void> {
  const send = sender();
  if (!send) return; // no VAPID keys: in-app only
  const subs = await repo.listSubscriptionsSystem(db, [...new Set(rows.map((r) => r.user_id))]);
  await Promise.all(
    rows.flatMap((r) =>
      subs
        .filter((s) => s.user_id === r.user_id)
        .map(async (s) => {
          const status = await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payloadOf(r, now));
          if (status === 404 || status === 410) await repo.deleteSubscriptionSystem(db, s.id); // gone for good
          else if (status < 200 || status >= 300) console.error(JSON.stringify({ level: 'error', where: 'reminders.push', status })); // status only (AGENTS.md section 5)
        }),
    ),
  );
}

export type Subscription = { id: string };
const MAX_ENDPOINT = 1000;
const isKey = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200;

/** S10-2: validates a browser PushSubscription (`toJSON()` shape) and stores it for this User. */
export async function registerPushSubscription(db: Db, userId: string, input: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): Promise<Subscription | Invalid> {
  const invalid: Record<string, string> = {};
  const endpoint = input.endpoint;
  const https = typeof endpoint === 'string' && URL.canParse(endpoint) && new URL(endpoint).protocol === 'https:';
  if (!https || (endpoint as string).length > MAX_ENDPOINT) invalid.endpoint = 'This is not a push subscription from a browser.';
  if (!isKey(input.keys?.p256dh) || !isKey(input.keys?.auth)) invalid.keys = 'This push subscription has no keys.';
  if (Object.keys(invalid).length) return { invalid };
  return { id: await repo.upsertSubscription(db, userId, { endpoint: endpoint as string, p256dh: input.keys!.p256dh as string, auth: input.keys!.auth as string }) };
}

export const removePushSubscription = (db: Db, userId: string, id: string) => repo.deleteSubscription(db, userId, id);

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
