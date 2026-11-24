// S08: Possible Duplicate, and the add / update / dismiss choice (FR-05, FR-06, BR-04, BR-13, BR-11).
// Messages are sent in the week of Mon 14 June 2027, so the routes, which use the real clock, see every Event as upcoming.
// Fri 18 June 2027 plays the "Friday 23 October 2026" of AC-05.10 and AC-06.4.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db, withTransaction } from '../../shared/db';
import { pktToUtc } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import * as jobs from '../jobs';
import { ingestMessages, updateExisting, type ChatRef, type DetectedEventView } from './service';

afterAll(closePool);

const SENT = (day: number, h: number) => pktToUtc(2027, 6, day, h, 0);
const FRI = '2027-06-18';
const MOVED = "Friday's meeting is now at 5pm";

async function user() {
  const agent = request.agent(app);
  const email = uniqueEmail('duplicate');
  await agent.post('/api/auth/register').send({ email, password: 'kal-5-baje-meeting' });
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
  const detected = async () => (await agent.get('/api/detected-events')).body as DetectedEventView[];
  const upcoming = async () => (await agent.get('/api/events')).body as { id: string; date: string; time: string | null; place: string | null }[];
  return { agent, userId, detected, upcoming };
}

const chat = (): ChatRef => ({ id: randomUUID(), name: 'Project Team', colour: 3 });

/** Reads one message from a Chat, as an upload would. */
async function read(userId: string, from: ChatRef, text: string, sentAt: Date) {
  await withTransaction(db(), (tx) => ingestMessages(userId, from, [{ sentAt, sender: 'Usman', text }], tx, new Date()));
}

/** AC-05.10: "Meeting Friday 3pm in Room 4" confirmed from Chat A, then a follow-up read from Chat A. */
async function confirmedThenFollowUp(followUp = MOVED) {
  const u = await user();
  const A = chat();
  await read(u.userId, A, 'Meeting Friday 3pm in Room 4', SENT(14, 10));
  const [first] = await u.detected();
  const confirmed = (await u.agent.post(`/api/detected-events/${first.id}/confirm`)).body as { id: string };
  await read(u.userId, A, followUp, SENT(15, 9));
  const [dup] = await u.detected();
  return { ...u, A, confirmed, dup };
}

const count = async (sql: string, args: unknown[]) => Number((await db().query(sql, args)).rows[0].n);
const pendingJobs = (key: string) => count(`select count(*) n from jobs where dedupe_key = $1 and status = 'pending'`, [key]);
const sourceMessages = (userId: string) => count('select count(*) n from source_messages where user_id = $1', [userId]);

describe.skipIf(!hasDb)('Possible Duplicate (BR-04, BR-13)', () => {
  it('S08-1 AC-05.10: the follow-up from the same Chat and date is marked and shows the existing Confirmed Event', async () => {
    const { agent, confirmed, dup } = await confirmedThenFollowUp();
    const existing = { kind: 'confirmed', id: confirmed.id, title: 'Meeting', date: FRI, time: '15:00', place: 'Room 4' };
    expect(dup).toMatchObject({ title: "Friday's meeting", date: FRI, time: '17:00', possibleDuplicate: existing });
    expect((await agent.get(`/api/detected-events/${dup.id}`)).body.possibleDuplicate).toEqual(existing);
  });

  it('S08-2 BR-13: another Chat, a Manual Event, and the day before or after are not matches', async () => {
    const { agent, userId, detected } = await user();
    const A = chat();
    for (const text of ['Meeting Thursday 3pm', 'Meeting Saturday 3pm']) await read(userId, A, text, SENT(14, 10));
    for (const e of await detected()) expect((await agent.post(`/api/detected-events/${e.id}/confirm`)).status).toBe(201);
    expect((await agent.post('/api/events').send({ title: 'Meeting', date: FRI, time: '15:00' })).status).toBe(201);
    await read(userId, A, MOVED, SENT(15, 9));
    await read(userId, chat(), 'Meeting Friday 3pm', SENT(15, 10)); // Chat B
    const list = await detected();
    expect(list.map((e) => [e.date, e.possibleDuplicate])).toEqual([
      [FRI, null],
      [FRI, null],
    ]);
  });

  it('S08-3 BR-04: of two Detected Events from one Chat and date only the later is marked; Needs date never is', async () => {
    const { userId, detected } = await user();
    const A = chat();
    await read(userId, A, 'Quiz Friday 9am', SENT(14, 10));
    await read(userId, A, MOVED, SENT(15, 9));
    await read(userId, A, 'agle hafte presentation hai', SENT(15, 10));
    const [quiz, meeting, needsDate] = await detected();
    expect(quiz).toMatchObject({ title: 'Quiz', possibleDuplicate: null });
    expect(meeting.possibleDuplicate).toEqual({ kind: 'detected', id: quiz.id, title: 'Quiz', date: FRI, time: '09:00', place: null });
    expect(needsDate).toMatchObject({ date: null, possibleDuplicate: null });
  });

  it('S08-4 AC-06.4: update moves the Confirmed Event and its Reminder, keeps its title and place, and creates no new Event', async () => {
    const { agent, userId, confirmed, dup, detected, upcoming } = await confirmedThenFollowUp();
    const res = await agent.post(`/api/detected-events/${dup.id}/duplicate`).send({ choice: 'update', existingId: confirmed.id });
    expect(res.status).toBe(200);
    const moved = { id: confirmed.id, title: 'Meeting', date: FRI, time: '17:00', place: 'Room 4' };
    expect(res.body).toMatchObject(moved);
    expect(await upcoming()).toMatchObject([moved]);
    expect(await detected()).toEqual([]);
    expect(await sourceMessages(userId)).toBe(0);
    expect(await pendingJobs(dup.id)).toBe(0);
    await jobs.dispatchOutbox(db(), new Date(), { limit: 200, timeBudgetMs: 20_000 }); // in case the 5-message inline dispatch was busy
    const reminder = await db().query('select reminder_at from reminders where event_id = $1', [confirmed.id]);
    expect(reminder.rows).toEqual([{ reminder_at: pktToUtc(2027, 6, 18, 16, 30) }]);
  });

  it('S08-4 D-28: a place in the follow-up replaces the existing place', async () => {
    const { agent, confirmed, dup } = await confirmedThenFollowUp("Friday's meeting is now at 5pm in Room 7");
    const res = await agent.post(`/api/detected-events/${dup.id}/duplicate`).send({ choice: 'update', existingId: confirmed.id });
    expect(res.body).toMatchObject({ time: '17:00', place: 'Room 7' });
  });

  it('S08-5 BR-13: updating an existing Detected Event replaces it; the new one stays for review', async () => {
    const { agent, userId, detected } = await user();
    const A = chat();
    await read(userId, A, 'Quiz Friday 9am', SENT(14, 10));
    await read(userId, A, MOVED, SENT(15, 9));
    const [quiz, meeting] = await detected();
    const res = await agent.post(`/api/detected-events/${meeting.id}/duplicate`).send({ choice: 'update', existingId: quiz.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: meeting.id, possibleDuplicate: null });
    expect((await detected()).map((e) => e.id)).toEqual([meeting.id]);
    expect(await sourceMessages(userId)).toBe(1);
    expect(await pendingJobs(quiz.id)).toBe(0);
  });

  it('S08-6 FR-06, BR-21, BR-16: update is refused like Confirm while a detail is Uncertain or the time has passed', async () => {
    const { agent, userId, confirmed, dup, upcoming } = await confirmedThenFollowUp('Friday meeting 5 baje');
    expect(dup.uncertain).toContain('time');
    const res = await agent.post(`/api/detected-events/${dup.id}/duplicate`).send({ choice: 'update', existingId: confirmed.id });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'NEEDS_REVIEW', fields: { time: expect.any(String) } });

    await agent.post(`/api/detected-events/${dup.id}/review`).send({ accept: ['time'] });
    const late = await updateExisting(db(), userId, dup.id, confirmed.id, pktToUtc(2027, 6, 18, 17, 1));
    expect(late).toMatchObject({ refused: 'PAST', fields: { time: expect.any(String) } });
    expect(await upcoming()).toMatchObject([{ id: confirmed.id, time: '15:00' }]);
  });

  it('S08-7: NOT_DUPLICATE when the date was changed in review', async () => {
    const first = await confirmedThenFollowUp();
    const reviewed = await first.agent.post(`/api/detected-events/${first.dup.id}/review`).send({ date: '2027-06-19' });
    expect(reviewed.body.possibleDuplicate).toBeNull();
    const moved = await first.agent.post(`/api/detected-events/${first.dup.id}/duplicate`).send({ choice: 'update', existingId: first.confirmed.id });
    expect(moved.status).toBe(422);
    expect(moved.body.error).toBe('NOT_DUPLICATE');
  });

  it('S08-7: NOT_DUPLICATE when another id is sent or the existing Event was deleted', async () => {
    const second = await confirmedThenFollowUp();
    for (const existingId of [randomUUID(), 'not-an-id']) {
      const res = await second.agent.post(`/api/detected-events/${second.dup.id}/duplicate`).send({ choice: 'update', existingId });
      expect(res.body.error).toBe('NOT_DUPLICATE');
    }
    expect((await second.agent.delete(`/api/events/${second.confirmed.id}`)).status).toBe(204);
    expect((await second.detected())[0].possibleDuplicate).toBeNull();
    const gone = await second.agent.post(`/api/detected-events/${second.dup.id}/duplicate`).send({ choice: 'update', existingId: second.confirmed.id });
    expect(gone.body.error).toBe('NOT_DUPLICATE');
    expect(await second.detected()).toHaveLength(1);
  });

  it('S08-8 FR-06: add confirms a second Event', async () => {
    const added = await confirmedThenFollowUp();
    expect((await added.agent.post(`/api/detected-events/${added.dup.id}/duplicate`).send({ choice: 'add' })).status).toBe(201);
    expect((await added.upcoming()).map((e) => e.time)).toEqual(['15:00', '17:00']);
  });

  it('S08-8 FR-06: dismiss removes the Detected Event and leaves the existing one', async () => {
    const dismissed = await confirmedThenFollowUp();
    expect((await dismissed.agent.post(`/api/detected-events/${dismissed.dup.id}/duplicate`).send({ choice: 'dismiss' })).status).toBe(204);
    expect(await dismissed.detected()).toEqual([]);
    expect(await dismissed.upcoming()).toMatchObject([{ id: dismissed.confirmed.id, time: '15:00' }]);
  });

  it('S08-9 BR-11 two Users: another User\'s Event on the same Chat id and date is never a match, and their ids are not reachable', async () => {
    const one = await confirmedThenFollowUp();
    const two = await user();
    await read(two.userId, one.A, MOVED, SENT(15, 9));
    const [theirs] = await two.detected();
    expect(theirs.possibleDuplicate).toBeNull();
    expect((await two.agent.post(`/api/detected-events/${one.dup.id}/duplicate`).send({ choice: 'update', existingId: one.confirmed.id })).status).toBe(404);
    const res = await two.agent.post(`/api/detected-events/${theirs.id}/duplicate`).send({ choice: 'update', existingId: one.confirmed.id });
    expect(res.body.error).toBe('NOT_DUPLICATE');
    expect(await one.upcoming()).toMatchObject([{ id: one.confirmed.id, time: '15:00' }]);
  });

  it('S08-10: an unknown choice, or update without existingId, answers 400; a session is needed', async () => {
    const { agent, dup } = await confirmedThenFollowUp();
    for (const body of [{ choice: 'merge' }, { choice: 'update' }, {}]) {
      const res = await agent.post(`/api/detected-events/${dup.id}/duplicate`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.fields.choice).toEqual(expect.any(String));
    }
    expect((await request(app).post(`/api/detected-events/${dup.id}/duplicate`).send({ choice: 'add' })).status).toBe(401);
  });
});
