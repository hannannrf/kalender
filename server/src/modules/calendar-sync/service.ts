// calendar-sync (FR-08, FR-13 unlink, BR-09, BR-10, BR-18, MF-06): one-way copies of Confirmed Events in the primary Google Calendar.
// Event changes arrive only through outbox messages (ADR-002). Nothing is ever read back from Google (BR-09).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { OutboxMessage } from '../../shared/contracts/outbox';
import { withTransaction, type Db } from '../../shared/db';
import { logError } from '../../shared/log';
import { eventStart, pktParts } from '../../shared/time';
import * as jobs from '../jobs';
import { consentUrl, googleApi, type Google, type GoogleEvent } from './google';
import * as repo from './repository';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const RETRY = 'calendarRetry';
const RETRY_AFTER = [1, 5, 15]; // minutes after the first failure (BR-10, R2-12)
const STATE_TTL_MS = 10 * MINUTE;
/** One key per retry, so a retry that fails can queue the next while its own job is still the pending row. */
const retryKey = (eventId: string, retries: number) => `${eventId}/${retries}`;
const ZONE = 'Asia/Karachi';

let testGoogle: Google | undefined;
/** Test seam: replaces Google. Not exported from the module's index. */
export function setGoogle(google: Google | undefined): void {
  testGoogle = google;
}
const google = () => testGoogle ?? googleApi;

export const configured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.TOKEN_ENCRYPTION_KEY);
const ok = (status: number) => status >= 200 && status < 300;
const logStatus = (where: string, status: number) => console.error(JSON.stringify({ level: 'error', where, status })); // status only (AGENTS.md section 5)

// ---- Secrets (ADR-005, Q-27): one key from the environment, split by label into a token key and a state key ----

const keyFor = (label: string) => Buffer.from(hkdfSync('sha256', process.env.TOKEN_ENCRYPTION_KEY!, '', label, 32));

/** AES-256-GCM: base64url of IV (12 bytes), tag (16 bytes) and ciphertext. */
export function seal(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor('kalender calendar tokens'), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

function unseal(sealed: string): string {
  const raw = Buffer.from(sealed, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', keyFor('kalender calendar tokens'), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

const mac = (data: string) => createHmac('sha256', keyFor('kalender oauth state')).update(data).digest('base64url');

/** Q-27: the OAuth `state` names the User and when it expires, and is signed, so no table is needed. */
export function signState(userId: string, now: Date): string {
  const data = `${userId}.${now.getTime() + STATE_TTL_MS}`;
  return `${data}.${mac(data)}`;
}

function stateValid(state: string, userId: string, now: Date): boolean {
  const [id, expires, signature = ''] = state.split('.');
  const expected = Buffer.from(mac(`${id}.${expires}`));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) && id === userId && Number(expires) >= now.getTime();
}

// ---- Linking (MF-06) ----

export type LinkStatus = 'not_configured' | 'not_linked' | 'linked' | 'needs_reconnect';

export async function getLinkStatus(db: Db, userId: string): Promise<LinkStatus> {
  if (!configured()) return 'not_configured';
  return (await repo.getLink(db, userId))?.status ?? 'not_linked';
}

/** S11-1: the Google consent address, or undefined when Google is not set up on this server. */
export function startLink(userId: string, redirectUri: string, now: Date): string | undefined {
  return configured() ? consentUrl(redirectUri, signState(userId, now)) : undefined;
}

export type LinkResult = 'linked' | 'denied' | 'failed';

/** S11-2: stores the tokens encrypted and publishes CalendarLinked, or stores nothing. */
export async function completeLink(db: Pool, userId: string, query: Record<string, unknown>, redirectUri: string, now: Date): Promise<LinkResult> {
  if (query.error !== undefined) return 'denied'; // the User did not allow access
  if (!configured() || typeof query.state !== 'string' || typeof query.code !== 'string' || !stateValid(query.state, userId, now)) return 'failed';
  const tokens = await google().exchangeCode(query.code, redirectUri);
  if (typeof tokens === 'number' || !tokens.refreshToken) {
    logStatus('calendar-sync.exchangeCode', typeof tokens === 'number' ? tokens : 200);
    return 'failed';
  }
  await withTransaction(db, async (tx) => {
    await repo.upsertLink(tx, userId, seal(tokens.refreshToken!), seal(tokens.accessToken), new Date(now.getTime() + tokens.expiresIn * 1000));
    await jobs.publish(tx, { type: 'CalendarLinked', payload: { userId } });
  });
  return 'linked';
}

async function revoke(sealedRefreshToken: string): Promise<void> {
  try {
    const status = await google().revoke(unseal(sealedRefreshToken));
    if (!ok(status)) logStatus('calendar-sync.revoke', status);
  } catch (err) {
    logError('calendar-sync.revoke', err); // best-effort: the token is deleted here either way
  }
}

/** AC-13.2, R2-8: the tokens go and pending retries stop; copies already in Google stay, so a relink adds no second copy. */
export async function unlink(db: Pool, userId: string): Promise<void> {
  const refreshToken = await withTransaction(db, async (tx) => {
    const link = await repo.getLink(tx, userId);
    if (!link) return undefined;
    for (const c of await repo.settleCopiesOnUnlink(tx, userId)) await jobs.cancel(tx, RETRY, retryKey(c.event_id, c.retries));
    await repo.deleteLink(tx, userId);
    return link.refresh_token;
  });
  if (refreshToken) await revoke(refreshToken);
}

/** AC-13.3: called only by identity's account deletion. Revokes the Google grant best-effort, then deletes the link and copies. */
export async function deleteAllForUser(tx: Db, userId: string): Promise<void> {
  const link = await repo.getLink(tx, userId);
  if (link) await revoke(link.refresh_token);
  await repo.deleteAllForUser(tx, userId);
}

// ---- Copies ----

/** The Google event id: the Event id without dashes (lowercase hex is valid base32hex), so one Event has one copy (BR-18). */
export const googleId = (eventId: string) => eventId.replace(/-/g, '');

/** Architecture section 7 and S11 decision 3(a): title, time and place, with no Chat name. */
export function googleEvent(eventId: string, d: repo.Details): GoogleEvent {
  const base = { id: googleId(eventId), status: 'confirmed' as const, summary: d.title, description: 'Added by Kalender', ...(d.place && { location: d.place }) };
  if (d.time === null) return { ...base, start: { date: d.date }, end: { date: pktParts(new Date(eventStart(d.date, null).getTime() + DAY)).date } };
  const end = pktParts(new Date(eventStart(d.date, d.time).getTime() + 60 * MINUTE));
  return { ...base, start: { dateTime: `${d.date}T${d.time}:00`, timeZone: ZONE }, end: { dateTime: `${end.date}T${end.time}:00`, timeZone: ZONE } };
}

/** A usable access token, refreshed when it ends within a minute. Expired or revoked access marks the link (MF-06). */
async function accessToken(tx: Db, link: repo.LinkRow, now: Date): Promise<string | undefined> {
  if (link.status === 'needs_reconnect') return undefined;
  if (link.access_token && link.access_expires_at && link.access_expires_at.getTime() - MINUTE > now.getTime()) return unseal(link.access_token);
  const tokens = await google().refresh(unseal(link.refresh_token));
  if (typeof tokens === 'number') {
    if (tokens === 400 || tokens === 401) await repo.setNeedsReconnect(tx, link.user_id); // invalid_grant: Testing-mode 7 days, or revoked in Google
    else logStatus('calendar-sync.refresh', tokens);
    return undefined;
  }
  await repo.setAccessToken(tx, link.user_id, seal(tokens.accessToken), new Date(now.getTime() + tokens.expiresIn * 1000));
  return tokens.accessToken;
}

/**
 * Makes Google match the copy row. Adding a copy that is already there (409) updates it; changing a copy that is gone
 * from Google (404, 410) adds it back (BR-09); removing one that is gone counts as done.
 */
async function push(tx: Db, link: repo.LinkRow, copy: repo.CopyRow, now: Date): Promise<boolean> {
  const token = await accessToken(tx, link, now);
  if (!token) return false;
  const g = google();
  if (copy.details === null) {
    const status = await g.deleteEvent(token, googleId(copy.event_id));
    return ok(status) || status === 404 || status === 410;
  }
  const event = googleEvent(copy.event_id, copy.details);
  let status: number;
  if (copy.in_google) {
    status = await g.updateEvent(token, event);
    if (status === 404 || status === 410) status = await g.insertEvent(token, event);
  } else {
    status = await g.insertEvent(token, event);
    if (status === 409) status = await g.updateEvent(token, event);
  }
  if (status === 401) await repo.setAccessToken(tx, link.user_id, null, null); // the next try refreshes it
  if (!ok(status)) logStatus('calendar-sync.push', status);
  return ok(status);
}

type Mode = 'change' | 'retry' | 'manual';

/**
 * One try at making Google match the copy row, then BR-10: a failed change is retried at +1, +5 and +15 minutes
 * from its first failure (R2-12); after the third failed retry the copy is "Calendar update failed".
 * A failure never throws, so the Event, its Reminder and the outbox delivery are never undone.
 */
async function attempt(tx: Db, userId: string, eventId: string, now: Date, mode: Mode): Promise<repo.CopyRow['status'] | undefined> {
  const link = await repo.getLink(tx, userId);
  const copy = await repo.getCopy(tx, userId, eventId, true);
  if (!link || !copy) return undefined;
  const done = await push(tx, link, copy, now).catch((err) => {
    logError('calendar-sync.push', err);
    return false;
  });
  if (mode === 'manual' && !done) return copy.status; // stays "Calendar update failed"; the User can try again
  await jobs.cancel(tx, RETRY, retryKey(eventId, copy.retries)); // the retry queued before this try, if any
  if (done) {
    if (copy.details === null) await repo.deleteCopy(tx, userId, eventId);
    else await repo.markSynced(tx, userId, eventId);
    return 'synced';
  }
  const retries = mode === 'retry' ? copy.retries + 1 : 0;
  const firstFailedAt = mode === 'retry' && copy.first_failed_at ? copy.first_failed_at : now;
  if (retries >= RETRY_AFTER.length) {
    await repo.markFailure(tx, userId, eventId, 'failed', firstFailedAt, retries);
    return 'failed';
  }
  await repo.markFailure(tx, userId, eventId, 'pending', firstFailedAt, retries);
  await jobs.enqueue(tx, RETRY, { eventId }, {
    runAt: new Date(firstFailedAt.getTime() + RETRY_AFTER[retries] * MINUTE),
    userId,
    dedupeKey: retryKey(eventId, retries),
  });
  return 'pending';
}

/** Outbox subscriber. A new change replaces what the copy should show and starts a fresh try. */
async function onMessage(tx: Db, message: OutboxMessage, now: Date): Promise<void> {
  if (message.type === 'CalendarLinked') return;
  const { userId, eventId } = message.payload;
  const link = await repo.getLink(tx, userId);
  if (message.type === 'EventDeleted') {
    if (!(await repo.getCopy(tx, userId, eventId))) return; // never copied
    if (!link) return repo.deleteCopy(tx, userId, eventId); // unlinked: that calendar is out of reach, and its copy stays (R2-8)
    await repo.setDesired(tx, userId, eventId, null);
  } else {
    if (!link) return; // AC-13.2: nothing is added while unlinked
    const { title, date, time, place } = message.payload;
    await repo.setDesired(tx, userId, eventId, { title, date, time, place });
  }
  await attempt(tx, userId, eventId, now, 'change');
}

/** S11-8: "Try again" on a copy marked "Calendar update failed". Undefined when this User has no copy for the Event. */
export async function retryNow(db: Pool, userId: string, eventId: string, now: Date): Promise<repo.CopyRow['status'] | undefined> {
  return withTransaction(db, async (tx) => {
    const copy = await repo.getCopy(tx, userId, eventId, true);
    if (!copy || copy.status !== 'failed') return copy?.status;
    return attempt(tx, userId, eventId, now, 'manual');
  });
}

/** Read model for the events endpoints (architecture 6.1 exception): the Events whose copy is "Calendar update failed" (GL-22). */
export async function getStatuses(db: Db, userId: string, eventIds: string[]): Promise<Record<string, 'failed'>> {
  if (eventIds.length === 0) return {};
  return Object.fromEntries((await repo.listFailed(db, userId, eventIds)).map((id) => [id, 'failed' as const]));
}

/** Called once by the composition root (Q-1). */
export function register(registry: jobs.Registry): void {
  for (const type of ['EventConfirmed', 'EventUpdated', 'EventDeleted', 'EventResync'] as const) registry.subscribe(type, 'calendar-sync', onMessage);
  registry.registerHandler(RETRY, async (tx, job, now) => {
    await attempt(tx, job.userId!, String(job.payload.eventId), now, 'retry');
  });
}
