// Detected Events (FR-05, FR-06), Confirmed Events (FR-11) and Source Message lifetime (BR-05).
import { detect, type DetectedEventDraft, type Mark } from '../detection';
import * as jobs from '../jobs';
import type { EventSnapshot } from '../../shared/contracts/outbox';
import { withTransaction, type Db } from '../../shared/db';
import { eventStart, pktParts, startOfMinute } from '../../shared/time';
import type { Pool } from 'pg';
import * as repo from './repository';

export type ChatRef = { id: string; name: string; colour: number };
export type IncomingMessage = { sentAt: Date; sender: string; text: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** R2-2 and BR-05: a draft already over at upload time is not stored. */
function stillUpcoming(d: DetectedEventDraft, sentAt: Date, now: Date): boolean {
  if (d.date === null) return sentAt.getTime() + 7 * DAY_MS > now.getTime(); // Needs date lives 7 days from sending
  if (d.time === null) return eventStart(d.date, null).getTime() + DAY_MS > now.getTime(); // All-day lasts to the end of its date (BR-14)
  return eventStart(d.date, d.time) > now;
}

const EXPIRE = 'events.expireDetected';

/** BR-14 and BR-05: a dated Detected Event goes at the end of its date (00:00 PKT next day); a Needs date one 7 days after sending. */
function expiryOf(date: string | null, sentAt: Date): Date {
  return date === null ? new Date(sentAt.getTime() + 7 * DAY_MS) : new Date(eventStart(date, null).getTime() + DAY_MS);
}

async function scheduleExpiry(tx: Db, userId: string, detectedId: string, date: string | null, sentAt: Date): Promise<void> {
  await jobs.enqueue(tx, EXPIRE, { detectedId }, { runAt: expiryOf(date, sentAt), userId, dedupeKey: detectedId });
}

/**
 * Detects Events in messages read from an upload and stores them with their Source Message.
 * Runs inside the caller's transaction. A message with no upcoming Event is not stored (BR-05, AC-05.4).
 * Returns how many Detected Events were stored.
 */
export async function ingestMessages(userId: string, chat: ChatRef, messages: IncomingMessage[], tx: Db, now: Date): Promise<number> {
  let stored = 0;
  for (const message of messages) {
    const drafts = detect(message.text, message.sentAt).filter((d) => stillUpcoming(d, message.sentAt, now));
    if (drafts.length === 0) continue;
    const sourceMessageId = await repo.insertSourceMessage(tx, userId, { chatId: chat.id, ...message });
    for (const d of drafts) {
      const detectedId = await repo.insertDetected(tx, userId, {
        chatId: chat.id,
        chatName: chat.name,
        chatColour: chat.colour,
        sourceMessageId,
        title: d.title,
        date: d.date,
        time: d.time,
        place: d.place,
        uncertain: d.uncertain,
        rules: d.rules,
      });
      await scheduleExpiry(tx, userId, detectedId, d.date, message.sentAt);
      stored++;
    }
  }
  return stored;
}

export type DetectedEventView = {
  id: string;
  chat: ChatRef;
  title: string;
  date: string | null;
  time: string | null;
  place: string | null;
  uncertain: string[];
  rules: string[];
  /** BR-04: the existing Event this one may duplicate. Only a hint (BR-13). */
  possibleDuplicate: ExistingEvent | null;
};

export type ExistingEvent = { kind: 'confirmed' | 'detected'; id: string; title: string; date: string; time: string | null; place: string | null };

const detectedView = (r: repo.DetectedRow): DetectedEventView => ({
  id: r.id,
  chat: { id: r.chat_id, name: r.chat_name, colour: r.chat_colour },
  title: r.title,
  date: r.date,
  time: r.time,
  place: r.place,
  uncertain: r.uncertain,
  rules: r.rules,
  possibleDuplicate: r.dup_id
    ? { kind: r.dup_kind!, id: r.dup_id, title: r.dup_title!, date: r.dup_date!, time: r.dup_time, place: r.dup_place }
    : null,
});

export async function listDetected(db: Db, userId: string): Promise<DetectedEventView[]> {
  return (await repo.listDetected(db, userId)).map(detectedView);
}

export type DetectedEventDetail = DetectedEventView & { message: { sender: string; text: string; sentAt: string } };

export async function getDetected(db: Db, userId: string, id: string): Promise<DetectedEventDetail | undefined> {
  const row = await repo.getDetected(db, userId, id);
  return row && { ...detectedView(row), message: { sender: row.sender, text: row.text, sentAt: row.sent_at.toISOString() } };
}

// ---- Review (FR-06, BR-21) ----

export type ReviewInput = { title?: unknown; date?: unknown; time?: unknown; place?: unknown; accept?: unknown };
export type Invalid = { invalid: Record<string, string> };

const MARKS: readonly Mark[] = ['date', 'time', 'event'];
const isDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
};
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export type Details = { title: string; date: string; time: string | null; place: string | null };
export type DetailsInput = { title?: unknown; date?: unknown; time?: unknown; place?: unknown };

/** Checks the Event details that were sent (S04-9 limits); `required` details must be sent. Shared by review, create and edit. */
function readDetails(input: DetailsInput, required: ('title' | 'date')[] = []): { details: Partial<Details>; invalid: Record<string, string> } {
  const details: Partial<Details> = {};
  const invalid: Record<string, string> = {};
  const has = (k: keyof DetailsInput) => input[k] !== undefined || (required as string[]).includes(k);

  if (has('title')) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (title.length >= 1 && title.length <= 60) details.title = title;
    else invalid.title = 'Enter a title of 1 to 60 characters.';
  }
  if (has('date')) {
    if (typeof input.date === 'string' && isDate(input.date)) details.date = input.date;
    else invalid.date = input.date === undefined || input.date === '' ? 'Enter a date.' : 'Enter a real date.';
  }
  if (has('time')) {
    if (input.time === null || (typeof input.time === 'string' && isTime(input.time))) details.time = input.time;
    else invalid.time = 'Enter a time from 00:00 to 23:59, or choose All day.';
  }
  if (has('place')) {
    const place = typeof input.place === 'string' ? input.place.trim() || null : input.place;
    if (place === null || (typeof place === 'string' && place.length <= 40)) details.place = place;
    else invalid.place = 'Enter a place of up to 40 characters.';
  }
  return { details, invalid };
}

/**
 * Edits details and resolves Uncertain marks. A detail that is sent counts as reviewed (accepted or corrected),
 * so its mark is cleared; `accept` clears marks without a change, including the Event mark (U9).
 */
export async function review(db: Pool, userId: string, id: string, input: ReviewInput): Promise<DetectedEventView | Invalid | undefined> {
  const { details, invalid } = readDetails(input);
  const accept = input.accept ?? [];
  if (!Array.isArray(accept) || !accept.every((m) => MARKS.includes(m))) invalid.accept = 'Accept only date, time or event.';
  if (Object.keys(invalid).length) return { invalid };

  return withTransaction(db, async (tx) => {
    const row = await repo.getDetected(tx, userId, id, true);
    if (!row) return undefined;
    const reviewed = new Set<string>(accept as Mark[]);
    if ('date' in details) reviewed.add('date');
    if ('time' in details) reviewed.add('time');
    const change: repo.DetectedChange = {
      title: row.title,
      date: row.date,
      time: row.time,
      place: row.place,
      ...details,
      uncertain: row.uncertain.filter((m) => !reviewed.has(m)),
    };
    await repo.updateDetected(tx, userId, id, change);
    if (change.date !== row.date) await scheduleExpiry(tx, userId, id, change.date, row.sent_at); // a new date moves the BR-14 expiry
    return detectedView((await repo.getDetected(tx, userId, id))!); // read again: a new date can change the Possible Duplicate
  });
}

// ---- Confirm and dismiss (FR-06, BR-05, BR-16) ----

export type ConfirmedEventView = {
  id: string;
  chat: { id: string | null; name: string | null; colour: number | null };
  title: string;
  date: string;
  time: string | null;
  place: string | null;
};

const snapshot = (userId: string, r: repo.ConfirmedRow, at: Date): EventSnapshot => ({
  eventId: r.id,
  userId,
  title: r.title,
  date: r.date,
  time: r.time,
  place: r.place,
  sourceChatName: r.chat_name ?? 'Manual',
  at: at.toISOString(),
});

const confirmedView = (r: repo.ConfirmedRow): ConfirmedEventView => ({
  id: r.id,
  chat: { id: r.chat_id, name: r.chat_name, colour: r.chat_colour },
  title: r.title,
  date: r.date,
  time: r.time,
  place: r.place,
});

export type ConfirmRefusal = { refused: 'NEEDS_REVIEW' | 'NEEDS_DATE' | 'PAST'; message: string; fields: Record<string, string> };

const CHECK: Record<string, string> = {
  date: 'Check the date: keep it or change it.',
  time: 'Check the time: keep it or change it.',
  event: 'Check that this is a real Event: keep it or dismiss it.',
};

/** BR-16: which detail makes the Event past, if any. An All-day Event may be today; a timed one may start this minute. */
function pastDetail(date: string, time: string | null, now: Date): 'date' | 'time' | undefined {
  if (date < pktParts(now).date) return 'date';
  if (time !== null && eventStart(date, time) < startOfMinute(now)) return 'time';
  return undefined;
}

/** FR-06, BR-21, BR-16: why a Detected Event cannot yet become (or change) a Confirmed Event, if anything stops it. */
function confirmGate(row: repo.DetectedRow, now: Date): ConfirmRefusal | undefined {
  if (row.uncertain.length) {
    const fields = Object.fromEntries(row.uncertain.map((m) => [m, CHECK[m]]));
    return { refused: 'NEEDS_REVIEW', message: 'Check every highlighted detail before confirming.', fields };
  }
  if (row.date === null) return { refused: 'NEEDS_DATE', message: 'Add a date before confirming.', fields: { date: 'Add a date.' } };
  const past = pastDetail(row.date, row.time, now);
  if (past) return { refused: 'PAST', message: 'This Event is in the past. Change the date or time, or dismiss it.', fields: { [past]: `This ${past} has passed.` } };
  return undefined;
}

/** BR-05: a Detected Event leaves with its Source Message (if no other Detected Event uses it) and its expiry job. */
async function removeDetected(tx: Db, userId: string, row: repo.DetectedWithMessage): Promise<void> {
  await repo.deleteDetected(tx, userId, row.id);
  await repo.deleteSourceMessageIfUnused(tx, userId, row.source_message_id);
  await jobs.cancel(tx, EXPIRE, row.id);
}

/** The gate of FR-06 and BR-21, then one transaction: Confirmed Event in, Detected Event and unused message out. */
export async function confirm(db: Pool, userId: string, id: string, now: Date): Promise<ConfirmedEventView | ConfirmRefusal | undefined> {
  return withTransaction(db, async (tx) => {
    const row = await repo.getDetected(tx, userId, id, true);
    if (!row) return undefined;
    const refusal = confirmGate(row, now);
    if (refusal) return refusal;
    const confirmed = await repo.insertConfirmed(tx, userId, {
      chat_id: row.chat_id,
      chat_name: row.chat_name,
      chat_colour: row.chat_colour,
      title: row.title,
      date: row.date!,
      time: row.time,
      place: row.place,
    });
    await removeDetected(tx, userId, row);
    await jobs.publish(tx, { type: 'EventConfirmed', payload: snapshot(userId, confirmed, now) });
    return confirmedView(confirmed);
  });
}

/** AC-06.3: removes the Detected Event and, if no other Event uses it, its Source Message. False if not found. */
export async function dismiss(db: Pool, userId: string, id: string): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const row = await repo.getDetected(tx, userId, id, true);
    if (!row) return false;
    await removeDetected(tx, userId, row);
    return true;
  });
}

// ---- Possible Duplicate (FR-06, BR-04, BR-13) ----

export type DuplicateRefusal = ConfirmRefusal | { refused: 'NOT_DUPLICATE'; message: string; fields: Record<string, string> };

const NOT_DUPLICATE = {
  refused: 'NOT_DUPLICATE',
  message: 'This Event no longer matches that existing Event. Open it again to see your choices.',
  fields: {},
} as const;

/**
 * "Update the existing Event" (BR-13). `existingId` is the Event the User saw, and it must still be the match.
 * - Existing Confirmed Event: needs the Confirm gate. It takes the new date and time, and the new place only if there is
 *   one (D-28); its title stays. `EventUpdated` moves its Reminder and calendar copy. The Detected Event leaves.
 * - Existing Detected Event: it is replaced, so it leaves. The new one stays in the Inbox for review.
 * Returns the updated Confirmed Event, or the Detected Event that stays.
 */
export async function updateExisting(
  db: Pool,
  userId: string,
  id: string,
  existingId: string,
  now: Date,
): Promise<ConfirmedEventView | DetectedEventView | DuplicateRefusal | undefined> {
  return withTransaction(db, async (tx) => {
    const row = await repo.getDetected(tx, userId, id, true);
    if (!row) return undefined;
    if (row.dup_id !== existingId) return NOT_DUPLICATE;
    if (row.dup_kind === 'detected') {
      const old = await repo.getDetected(tx, userId, existingId, true);
      if (!old) return NOT_DUPLICATE; // removed since the match was read
      await removeDetected(tx, userId, old);
      return detectedView((await repo.getDetected(tx, userId, id))!);
    }
    const refusal = confirmGate(row, now);
    if (refusal) return refusal;
    const existing = await repo.getConfirmed(tx, userId, existingId, true);
    if (!existing) return NOT_DUPLICATE; // deleted since the match was read
    const updated = { ...existing, date: row.date!, time: row.time, place: row.place ?? existing.place };
    await repo.updateConfirmed(tx, userId, existingId, updated);
    await removeDetected(tx, userId, row);
    await jobs.publish(tx, { type: 'EventUpdated', payload: snapshot(userId, updated, now) });
    return confirmedView(updated);
  });
}

/**
 * BR-06, AC-04.1: on Revoke, deletes the Chat's unconfirmed Detected Events and their Source Messages and cancels their expiry.
 * Runs inside the caller's transaction. Confirmed Events stay; they hold the Chat name, not message text.
 */
export async function deleteUnconfirmedForChat(tx: Db, userId: string, chatId: string): Promise<number> {
  const ids = await repo.deleteDetectedForChat(tx, userId, chatId);
  for (const id of ids) await jobs.cancel(tx, EXPIRE, id);
  return ids.length;
}

export async function listUpcoming(db: Db, userId: string, now: Date): Promise<ConfirmedEventView[]> {
  const { date, time } = pktParts(now);
  return (await repo.listUpcoming(db, userId, date, time)).map(confirmedView);
}

// ---- Manual Events, edit and delete (FR-07, FR-12, BR-16) ----

export type PastRefusal = { refused: 'PAST'; message: string; fields: Record<string, string> };

function pastRefusal(e: { date: string; time: string | null }, now: Date): PastRefusal | undefined {
  const past = pastDetail(e.date, e.time, now);
  return past && { refused: 'PAST', message: 'An Event cannot be in the past. Choose a later date or time.', fields: { [past]: `This ${past} has passed.` } };
}

/** AC-07.1, AC-07.2: a Manual Event needs a title and a date that is not past. */
export async function createManual(db: Pool, userId: string, input: DetailsInput, now: Date): Promise<ConfirmedEventView | Invalid | PastRefusal> {
  const { details, invalid } = readDetails(input, ['title', 'date']);
  if (Object.keys(invalid).length) return { invalid };
  const event = { title: details.title!, date: details.date!, time: details.time ?? null, place: details.place ?? null };
  const past = pastRefusal(event, now);
  if (past) return past;
  return withTransaction(db, async (tx) => {
    const row = await repo.insertConfirmed(tx, userId, { chat_id: null, chat_name: null, chat_colour: null, ...event });
    await jobs.publish(tx, { type: 'EventConfirmed', payload: snapshot(userId, row, now) });
    return confirmedView(row);
  });
}

export async function getConfirmed(db: Db, userId: string, id: string): Promise<ConfirmedEventView | undefined> {
  const row = await repo.getConfirmed(db, userId, id);
  return row && confirmedView(row);
}

/** FR-12: changes only the details sent; the result must not be past (BR-16). The Source Chat never changes. */
export async function editConfirmed(
  db: Pool,
  userId: string,
  id: string,
  input: DetailsInput,
  now: Date,
): Promise<ConfirmedEventView | Invalid | PastRefusal | undefined> {
  const { details, invalid } = readDetails(input);
  if (Object.keys(invalid).length) return { invalid };
  return withTransaction(db, async (tx) => {
    const row = await repo.getConfirmed(tx, userId, id, true);
    if (!row) return undefined;
    const next = { title: row.title, date: row.date, time: row.time, place: row.place, ...details };
    const past = pastRefusal(next, now);
    if (past) return past;
    await repo.updateConfirmed(tx, userId, id, next);
    await jobs.publish(tx, { type: 'EventUpdated', payload: snapshot(userId, { ...row, ...next }, now) });
    return confirmedView({ ...row, ...next });
  });
}

/** FR-12: false if this User has no such Event. */
export async function deleteConfirmed(db: Pool, userId: string, id: string): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    if (!(await repo.deleteConfirmed(tx, userId, id))) return false;
    await jobs.publish(tx, { type: 'EventDeleted', payload: { eventId: id, userId } });
    return true;
  });
}

// ---- Timed deletions (BR-05, BR-14) ----

/** Removes an unreviewed Detected Event at its expiry, with its Source Message if no other Detected Event uses it. */
async function expireDetected(tx: Db, job: jobs.Job, now: Date): Promise<void> {
  const userId = job.userId!;
  const row = await repo.getDetected(tx, userId, String(job.payload.detectedId), true);
  if (!row) return; // confirmed or dismissed meanwhile
  if (expiryOf(row.date, row.sent_at) > now) return; // a review moved the date while this job ran; review already queued the new expiry
  await repo.deleteDetected(tx, userId, row.id);
  await repo.deleteSourceMessageIfUnused(tx, userId, row.source_message_id);
}

/** Called once by the composition root (Q-1). */
export function register(registry: jobs.Registry): void {
  registry.registerHandler(EXPIRE, expireDetected);
}
