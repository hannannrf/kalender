// S11: Google Calendar copies (FR-08, FR-13 unlink, BR-09, BR-10, BR-18, MF-06, AC-08.1-08.3, AC-12.1, AC-12.2, AC-13.2, AC-06.4).
// Cross-module (events, jobs, reminders, calendar-sync), so it lives in server/test (AGENTS.md section 3).
// Google is a fake (S11 section 3). This file runs on its own after the rest (root package.json "test"): the fake replaces
// Google only in this process, and another test file's tick must never hand these Users' messages to the real client.
// Scheduled times are in June 2020, as in S07, so these ticks reach only rows made by these tests.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import type { Google, GoogleEvent } from '../src/modules/calendar-sync/google';
import { completeLink, googleId, setGoogle, signState } from '../src/modules/calendar-sync/service';
import { confirm, createManual, deleteConfirmed, editConfirmed, ingestMessages, listDetected } from '../src/modules/events';
import { updateExisting } from '../src/modules/events/service';
import { tick } from '../src/modules/jobs';
import { closePool, db, withTransaction } from '../src/shared/db';
import { pktParts, pktToUtc } from '../src/shared/time';
import { hasDb, uniqueEmail } from './db';

vi.setConfig({ testTimeout: 240_000 }); // many ticks per test; each costs seconds against the remote Neon dev branch
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.TOKEN_ENCRYPTION_KEY = 'test-token-encryption-key';

/** The primary calendar of one Google account, as far as Kalender can see it. Deleted events stay as cancelled, as in Google. */
class FakeGoogle implements Google {
  calendar = new Map<string, { event: GoogleEvent; cancelled: boolean }>();
  failWith = 0; // a status every Calendar call answers with, such as 500
  refreshWith: number | undefined; // a status the token refresh answers with, such as 400 (invalid_grant)
  inserts = 0;
  revoked: string[] = [];

  async exchangeCode(code: string) {
    return code === 'good' ? { accessToken: 'access-1', expiresIn: 3600, refreshToken: 'refresh-1' } : 400;
  }
  async refresh() {
    return this.refreshWith ?? { accessToken: 'access-2', expiresIn: 3600 };
  }
  async insertEvent(_token: string, event: GoogleEvent) {
    if (this.failWith) return this.failWith;
    if (this.calendar.has(event.id)) return 409; // the id is taken, even by a cancelled event
    this.inserts++;
    this.calendar.set(event.id, { event, cancelled: false });
    return 200;
  }
  async updateEvent(_token: string, event: GoogleEvent) {
    if (this.failWith) return this.failWith;
    if (!this.calendar.has(event.id)) return 404;
    this.calendar.set(event.id, { event, cancelled: false }); // status "confirmed" brings a cancelled event back
    return 200;
  }
  async deleteEvent(_token: string, id: string) {
    if (this.failWith) return this.failWith;
    const copy = this.calendar.get(id);
    if (!copy) return 404;
    if (copy.cancelled) return 410;
    copy.cancelled = true;
    return 204;
  }
  async revoke(token: string) {
    this.revoked.push(token);
    return 200;
  }
  /** The copy a person sees in Google Calendar, if any. */
  shown(eventId: string) {
    const copy = this.calendar.get(googleId(eventId));
    return copy && !copy.cancelled ? copy.event : undefined;
  }
}

const google = new FakeGoogle();
setGoogle(google);
afterAll(async () => {
  setGoogle(undefined);
  await closePool();
});

/** A PKT instant on a day of June 2020. */
const T = (day: number, h: number, m: number, s = 0) => new Date(pktToUtc(2020, 6, day, h, m).getTime() + s * 1000);
const D = (day: number) => `2020-06-${String(day).padStart(2, '0')}`;
const REDIRECT = 'http://localhost:5173/api/calendar/callback';

async function user() {
  const agent = request.agent(app);
  const email = uniqueEmail('calendar');
  await agent.post('/api/auth/register').send({ email, password: 'kal-5-baje-meeting' });
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
  return { agent, userId };
}

/** Links at `at` and runs the two ticks that dispatch CalendarLinked and then the EventResync messages it makes. */
async function link(userId: string, at: Date) {
  expect(await completeLink(db(), userId, { code: 'good', state: signState(userId, at) }, REDIRECT, at)).toBe('linked');
  await tick(db(), at);
  await tick(db(), at);
}

/** A Manual Event made at `at`, with its EventConfirmed dispatched by a tick at the same moment. */
async function event(userId: string, input: { title: string; date: string; time: string | null; place?: string | null }, at: Date) {
  const made = await createManual(db(), userId, input, at);
  if (!('id' in made)) throw new Error(JSON.stringify(made));
  await tick(db(), at);
  return made.id;
}

const one = async <R>(sql: string, args: unknown[]) => (await db().query(sql, args)).rows[0] as R | undefined;
const linkRow = (userId: string) => one<{ refresh_token: string; access_token: string | null; status: string }>('select * from calendar_links where user_id = $1', [userId]);
const copy = (eventId: string) =>
  one<{ details: unknown; in_google: boolean; status: string; retries: number }>('select details, in_google, status, retries from calendar_copies where event_id = $1', [eventId]);
const retryAt = async (eventId: string) =>
  (await one<{ run_at: Date }>(`select run_at from jobs where type = 'calendarRetry' and dedupe_key like $1 || '/%' and status = 'pending'`, [eventId]))?.run_at;

describe.skipIf(!hasDb)('connect Google Calendar (FR-08, MF-06)', () => {
  it('S11-1 the link is a Google consent address for calendar.events with offline access and a signed state; 404 without Google settings', async () => {
    const { agent, userId } = await user();
    const res = await agent.post('/api/calendar/link');
    expect(res.status).toBe(200);
    const url = new URL(res.body.url);
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'test-client-id',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
    });
    expect(url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/[^/]+\/api\/calendar\/callback$/);
    expect(url.searchParams.get('state')!.split('.')[0]).toBe(userId);

    const saved = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const off = await agent.post('/api/calendar/link');
      expect([off.status, off.body]).toEqual([404, { error: 'calendar_not_configured' }]);
      expect((await agent.get('/api/calendar')).body).toEqual({ status: 'not_configured' });
    } finally {
      process.env.GOOGLE_CLIENT_ID = saved;
    }
  });

  it('S11-2 a good callback stores the tokens encrypted and publishes CalendarLinked; a bad one stores nothing', async () => {
    const { agent, userId } = await user();
    const other = await user();
    const state = new URL((await agent.post('/api/calendar/link')).body.url).searchParams.get('state')!;
    const callback = async (query: Record<string, string>) => {
      const res = await agent.get('/api/calendar/callback').query(query);
      expect(res.status).toBe(303);
      return res.headers.location;
    };

    expect(await callback({ error: 'access_denied', state })).toBe('/settings?calendar=denied');
    expect(await callback({ code: 'good', state: state.replace(userId, other.userId) })).toBe('/settings?calendar=failed'); // forged
    expect(await callback({ code: 'good', state: signState(other.userId, new Date()) })).toBe('/settings?calendar=failed'); // another User's
    expect(await callback({ code: 'refused-by-google', state })).toBe('/settings?calendar=failed');
    expect(await callback({ state })).toBe('/settings?calendar=failed');
    expect(await linkRow(userId)).toBeUndefined();
    expect((await agent.get('/api/calendar')).body).toEqual({ status: 'not_linked' });

    expect(await callback({ code: 'good', state })).toBe('/settings?calendar=linked');
    const row = (await linkRow(userId))!;
    expect(row.status).toBe('linked');
    for (const token of ['refresh-1', 'access-1']) expect(JSON.stringify(row)).not.toContain(token); // AGENTS.md section 5
    expect((await one<{ n: string }>(`select count(*) n from outbox where user_id = $1 and type = 'CalendarLinked'`, [userId]))!.n).toBe('1');
    expect((await agent.get('/api/calendar')).body).toEqual({ status: 'linked' });
    expect((await other.agent.get('/api/calendar')).body).toEqual({ status: 'not_linked' }); // BR-11
  });

  it('S11-2 BVA a state is good for 10 minutes and refused 1 second later', async () => {
    const { userId } = await user();
    const state = signState(userId, T(1, 9, 0));
    expect(await completeLink(db(), userId, { code: 'good', state }, REDIRECT, T(1, 9, 10, 1))).toBe('failed');
    expect(await linkRow(userId)).toBeUndefined();
    expect(await completeLink(db(), userId, { code: 'good', state }, REDIRECT, T(1, 9, 10))).toBe('linked');
  });
});

describe.skipIf(!hasDb)('one-way copies (FR-08, FR-12, BR-09, BR-18)', () => {
  it('S11-3 AC-08.1 a confirmed Detected Event and Manual Events appear with the same title, date and time, in Asia/Karachi', async () => {
    const { userId } = await user();
    await link(userId, T(1, 9, 0));
    const chat = { id: randomUUID(), name: 'Calendar Class', colour: 4 };
    await withTransaction(db(), (tx) => ingestMessages(userId, chat, [{ sentAt: T(1, 10, 0), sender: 'Usman', text: 'Meeting tomorrow at 3pm in Room 4' }], tx, T(1, 10, 0)));
    const [detected] = await listDetected(db(), userId);
    const confirmed = await confirm(db(), userId, detected.id, T(1, 10, 5));
    if (!confirmed || !('id' in confirmed)) throw new Error('not confirmed');
    await tick(db(), T(1, 10, 5));
    expect(google.shown(confirmed.id)).toEqual({
      id: googleId(confirmed.id),
      status: 'confirmed',
      summary: 'Meeting',
      location: 'Room 4',
      description: 'Added by Kalender', // S11 decision 3(a): no Chat name
      start: { dateTime: '2020-06-02T15:00:00', timeZone: 'Asia/Karachi' },
      end: { dateTime: '2020-06-02T16:00:00', timeZone: 'Asia/Karachi' },
    });
    expect(await copy(confirmed.id)).toMatchObject({ in_google: true, status: 'synced' });

    const allDay = await event(userId, { title: 'Sports day', date: D(3), time: null }, T(1, 10, 10));
    expect(google.shown(allDay)).toMatchObject({ summary: 'Sports day', start: { date: D(3) }, end: { date: D(4) } });
    expect(google.shown(allDay)).not.toHaveProperty('location');
    const late = await event(userId, { title: 'Viva', date: D(3), time: '23:30' }, T(1, 10, 15));
    expect(google.shown(late)).toMatchObject({ start: { dateTime: '2020-06-03T23:30:00' }, end: { dateTime: '2020-06-04T00:30:00' } });
  });

  it('S11-4 AC-08.2 AC-08.3 BR-18 linking adds each Upcoming Event without a copy, not past ones; relinking adds no second copy', async () => {
    const { userId } = await user();
    const past = await event(userId, { title: 'Old quiz', date: D(6), time: '09:00' }, T(5, 10, 0));
    const upcoming = await event(userId, { title: 'Lab', date: D(8), time: '11:00' }, T(5, 10, 0));
    expect(await copy(upcoming)).toBeUndefined(); // not linked yet
    await link(userId, T(7, 9, 0));
    expect(google.shown(upcoming)).toMatchObject({ summary: 'Lab' });
    expect(google.shown(past)).toBeUndefined();
    const inserts = google.inserts;
    await link(userId, T(7, 9, 30));
    expect(google.inserts).toBe(inserts);
    expect(await copy(upcoming)).toMatchObject({ in_google: true, status: 'synced' });
  });

  it('S11-5 AC-12.1 an edit changes the copy, and the Reminder moves too', async () => {
    const { userId } = await user();
    await link(userId, T(8, 9, 0));
    const id = await event(userId, { title: 'Quiz', date: D(10), time: '15:00', place: 'Room 2' }, T(8, 10, 0));
    await editConfirmed(db(), userId, id, { title: 'Quiz 2', time: '16:30', place: null }, T(8, 11, 0));
    await tick(db(), T(8, 11, 0));
    expect(google.shown(id)).toMatchObject({ summary: 'Quiz 2', start: { dateTime: '2020-06-10T16:30:00' }, end: { dateTime: '2020-06-10T17:30:00' } });
    expect(google.shown(id)).not.toHaveProperty('location');
    expect(await one('select reminder_at from reminders where event_id = $1', [id])).toEqual({ reminder_at: T(10, 16, 0) });
  });

  it('S11-5 AC-06.4 updating an existing Event from a Possible Duplicate changes its copy and adds no new one', async () => {
    const { userId } = await user();
    await link(userId, T(8, 9, 0));
    const chat = { id: randomUUID(), name: 'Project Team', colour: 3 };
    const read = (text: string, sentAt: Date) => withTransaction(db(), (tx) => ingestMessages(userId, chat, [{ sentAt, sender: 'Usman', text }], tx, sentAt));
    await read('Meeting Friday 3pm in Room 4', T(8, 10, 0)); // Mon 8 June 2020: Friday is 12 June
    const [first] = await listDetected(db(), userId);
    const confirmed = await confirm(db(), userId, first.id, T(8, 10, 5));
    if (!confirmed || !('id' in confirmed)) throw new Error('not confirmed');
    await tick(db(), T(8, 10, 5));
    await read("Friday's meeting is now at 5pm", T(9, 9, 0));
    const dup = (await listDetected(db(), userId)).find((d) => d.possibleDuplicate?.id === confirmed.id)!;
    expect(await updateExisting(db(), userId, dup.id, confirmed.id, T(9, 9, 5))).toMatchObject({ id: confirmed.id, time: '17:00' });
    await tick(db(), T(9, 9, 5));
    expect(google.shown(confirmed.id)).toMatchObject({ summary: 'Meeting', location: 'Room 4', start: { dateTime: '2020-06-12T17:00:00' } });
    expect((await one<{ n: string }>('select count(*) n from calendar_copies where user_id = $1', [userId]))!.n).toBe('1');
  });

  it('S11-6 AC-12.2 deleting an Event removes its copy from Google and cancels its Reminder', async () => {
    const { userId } = await user();
    await link(userId, T(11, 9, 0));
    const id = await event(userId, { title: 'Seminar', date: D(13), time: '12:00' }, T(11, 10, 0));
    expect(google.shown(id)).toBeDefined();
    await deleteConfirmed(db(), userId, id);
    await tick(db(), T(11, 10, 30));
    expect(google.shown(id)).toBeUndefined();
    expect(await copy(id)).toBeUndefined();
    expect(await one('select 1 from reminders where event_id = $1', [id])).toBeUndefined();
  });

  it('S11-7 BR-09 a copy deleted in Google stays deleted until the next edit in Kalender, which adds it back', async () => {
    const { userId } = await user();
    await link(userId, T(11, 9, 0));
    const id = await event(userId, { title: 'Group study', date: D(13), time: '18:00' }, T(11, 10, 0));
    google.calendar.get(googleId(id))!.cancelled = true; // deleted directly in Google Calendar
    await tick(db(), T(11, 11, 0));
    expect(google.shown(id)).toBeUndefined(); // nothing is read back from Google
    await editConfirmed(db(), userId, id, { title: 'Group study moved' }, T(11, 12, 0));
    await tick(db(), T(11, 12, 0));
    expect(google.shown(id)).toMatchObject({ summary: 'Group study moved' });
  });
});

describe.skipIf(!hasDb)('failures and retries (BR-10, MF-06)', () => {
  it('S11-8 BR-10 a failed copy keeps the Event and Reminder, is retried at +1, +5 and +15 minutes, then shows "Calendar update failed" with Try again', async () => {
    const { agent, userId } = await user();
    await link(userId, T(14, 9, 0));
    google.failWith = 500;
    try {
      const id = await event(userId, { title: 'Presentation', date: D(16), time: '10:00' }, T(14, 10, 0));
      expect(await copy(id)).toMatchObject({ status: 'pending', retries: 0, in_google: false });
      expect(await one('select status from reminders where event_id = $1', [id])).toEqual({ status: 'scheduled' });
      expect(await retryAt(id)).toEqual(T(14, 10, 1));
      await tick(db(), T(14, 10, 0, 59));
      expect(await copy(id)).toMatchObject({ retries: 0 });
      await tick(db(), T(14, 10, 1));
      expect([(await copy(id))!.retries, await retryAt(id)]).toEqual([1, T(14, 10, 5)]);
      await tick(db(), T(14, 10, 5));
      expect([(await copy(id))!.retries, await retryAt(id)]).toEqual([2, T(14, 10, 15)]);
      await tick(db(), T(14, 10, 15));
      expect(await copy(id)).toMatchObject({ status: 'failed', retries: 3 });
      expect(await retryAt(id)).toBeUndefined();
      expect((await agent.get(`/api/events/${id}`)).body).toMatchObject({ title: 'Presentation', calendarFailed: true });

      expect((await agent.post(`/api/calendar/retry/${id}`)).body).toEqual({ calendar: 'failed' }); // Google still failing
      google.failWith = 0;
      expect((await agent.post(`/api/calendar/retry/${id}`)).body).toEqual({ calendar: 'synced' });
      expect((await agent.get(`/api/events/${id}`)).body.calendarFailed).toBe(false);
      expect(google.shown(id)).toMatchObject({ summary: 'Presentation' });
    } finally {
      google.failWith = 0;
    }
  });

  it('S11-8 BR-10 deleting the Event or unlinking stops pending retries', async () => {
    const { agent, userId } = await user();
    await link(userId, T(15, 9, 0));
    google.failWith = 500;
    const deleted = await event(userId, { title: 'Cancelled class', date: D(17), time: '10:00' }, T(15, 10, 0));
    const unlinked = await event(userId, { title: 'Tutorial', date: D(17), time: '12:00' }, T(15, 10, 0));
    google.failWith = 0;
    expect(await retryAt(deleted)).toEqual(T(15, 10, 1));
    await deleteConfirmed(db(), userId, deleted);
    await tick(db(), T(15, 10, 0, 30));
    expect([await retryAt(deleted), await copy(deleted), google.shown(deleted)]).toEqual([undefined, undefined, undefined]);
    expect((await agent.delete('/api/calendar')).status).toBe(204);
    expect(await retryAt(unlinked)).toBeUndefined();
    expect(await copy(unlinked)).toBeUndefined(); // it never reached Google, so there is nothing to keep
  });

  it('S11-9 MF-06 expired or revoked Google access counts as a failure and asks to reconnect; reconnecting adds the copy', async () => {
    const { agent, userId } = await user();
    await link(userId, T(17, 9, 0));
    google.refreshWith = 400; // invalid_grant
    const id = await event(userId, { title: 'Viva', date: D(18), time: '14:00' }, T(17, 11, 0)).finally(() => (google.refreshWith = undefined)); // the access token ended at 10:00
    expect(await copy(id)).toMatchObject({ status: 'pending' });
    expect((await agent.get('/api/calendar')).body).toEqual({ status: 'needs_reconnect' });
    await link(userId, T(17, 11, 30));
    expect((await agent.get('/api/calendar')).body).toEqual({ status: 'linked' });
    expect(google.shown(id)).toMatchObject({ summary: 'Viva' });
    expect(await retryAt(id)).toBeUndefined();
  });
});

describe.skipIf(!hasDb)('unlink (FR-13, AC-13.2, R2-8)', () => {
  it('S11-10 AC-13.2 after unlinking nothing more is added and the tokens are gone; copies stay; relinking re-adds a missing copy once', async () => {
    const { agent, userId } = await user();
    await link(userId, T(20, 9, 0));
    const kept = await event(userId, { title: 'Kept', date: D(22), time: '10:00' }, T(20, 10, 0));
    const revoked = google.revoked.length;
    expect((await agent.delete('/api/calendar')).status).toBe(204);
    expect(await linkRow(userId)).toBeUndefined();
    expect(google.revoked.length).toBe(revoked + 1);
    expect((await agent.get('/api/calendar')).body).toEqual({ status: 'not_linked' });
    expect(google.shown(kept)).toBeDefined();
    expect(await copy(kept)).toMatchObject({ in_google: true });

    const after = await event(userId, { title: 'After unlink', date: D(23), time: '10:00' }, T(20, 11, 0));
    expect([google.shown(after), await copy(after)]).toEqual([undefined, undefined]);

    google.calendar.get(googleId(kept))!.cancelled = true; // deleted in Google while unlinked
    const inserts = google.inserts;
    await link(userId, T(21, 9, 0));
    expect(google.shown(kept)).toMatchObject({ summary: 'Kept' });
    expect(google.shown(after)).toMatchObject({ summary: 'After unlink' });
    expect(google.inserts).toBe(inserts + 1); // only "After unlink" is new
  });

  it('S11-11 AC-13.3 deleting the account revokes the Google grant and leaves no link or copy', async () => {
    const { agent, userId } = await user();
    await link(userId, T(25, 9, 0));
    const id = await event(userId, { title: 'Last class', date: D(26), time: '09:00' }, T(25, 10, 0));
    expect(await copy(id)).toBeDefined();
    const revoked = google.revoked.length;
    expect((await agent.delete('/api/account').send({ password: 'kal-5-baje-meeting' })).status).toBe(204);
    expect(google.revoked.slice(revoked)).toEqual(['refresh-1']);
    expect(await linkRow(userId)).toBeUndefined();
    expect((await one<{ n: string }>('select count(*) n from calendar_copies where user_id = $1', [userId]))!.n).toBe('0');
  });

  it('S11-11 BR-11 another User never sees, retries or unlinks this User\'s calendar', async () => {
    const a = await user();
    const b = await user();
    await link(a.userId, T(24, 9, 0));
    const tomorrow = pktParts(new Date(Date.now() + 86_400_000)).date; // the list uses the real clock
    const id = (await a.agent.post('/api/events').send({ title: 'Real time quiz', date: tomorrow, time: null })).body.id as string;
    await db().query(
      `insert into calendar_copies (event_id, user_id, status) values ($1, $2, 'failed') on conflict (event_id) do update set status = 'failed'`,
      [id, a.userId],
    );

    expect((await a.agent.get('/api/events')).body.find((e: { id: string }) => e.id === id)).toMatchObject({ calendarFailed: true });
    expect((await b.agent.post(`/api/calendar/retry/${id}`)).status).toBe(404);
    expect((await b.agent.post('/api/calendar/retry/not-an-id')).status).toBe(404);
    expect((await b.agent.get(`/api/events/${id}`)).status).toBe(404);
    expect((await b.agent.get('/api/calendar')).body).toEqual({ status: 'not_linked' });
    expect((await b.agent.delete('/api/calendar')).status).toBe(204);
    expect(await linkRow(a.userId)).toBeDefined();
    expect(await copy(id)).toMatchObject({ status: 'failed' });
  });
});
