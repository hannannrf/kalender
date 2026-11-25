// S07: jobs, outbox, tick, in-app Reminders, Lead Time and timed deletions (FR-09, FR-10, BR-05, BR-07, BR-08, BR-14, BR-19, NFR-03).
// Cross-module (events, jobs, reminders), so it lives in server/test (AGENTS.md section 3).
// Every scheduled time is in June 2020: test ticks then only reach rows made by these tests, never real data.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app';
import { confirm, createManual, deleteConfirmed, editConfirmed, ingestMessages, listDetected, review } from '../src/modules/events';
import { tick } from '../src/modules/jobs';
import { setDefaultLeadTime, setEventReminder } from '../src/modules/reminders';
import { setPushSender, whenText, type PushSender } from '../src/modules/reminders/service';
import { closePool, db, withTransaction } from '../src/shared/db';
import { pktToUtc } from '../src/shared/time';
import { hasDb, uniqueEmail } from './db';

afterAll(closePool);

/** A PKT instant on a day of June 2020. */
const T = (day: number, h: number, m: number, s = 0) => new Date(pktToUtc(2020, 6, day, h, m).getTime() + s * 1000);
const D = (day: number) => `2020-06-${String(day).padStart(2, '0')}`;

async function user() {
  const agent = request.agent(app);
  const email = uniqueEmail('reminders');
  await agent.post('/api/auth/register').send({ email, password: 'kal-5-baje-meeting' });
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
  return { agent, userId };
}

/** A Manual Event made at `at`, with its EventConfirmed dispatched by a tick at the same moment. */
async function event(userId: string, input: { title?: string; date: string; time?: string | null }, at: Date) {
  const made = await createManual(db(), userId, { title: 'Quiz', ...input }, at);
  if (!('id' in made)) throw new Error(JSON.stringify(made));
  await tick(db(), at);
  return made.id;
}

async function reminder(eventId: string) {
  const res = await db().query<{ status: string; reminder_at: Date | null; delivered_at: Date | null; lead_minutes: number | null }>(
    'select status, reminder_at, delivered_at, lead_minutes from reminders where event_id = $1',
    [eventId],
  );
  return res.rows[0];
}

const notifications = async (agent: request.Agent) => (await agent.get('/api/notifications')).body as { id: string; title: string; kind: string; eventId: string }[];

describe.skipIf(!hasDb)('Reminders (FR-09, FR-10)', () => {
  it('S07-1 AC-09.1 a 15:00 Event with 30 minutes is presented at 14:30, not at 14:29, with both times recorded', async () => {
    const { agent, userId } = await user();
    const id = await event(userId, { date: D(1), time: '15:00' }, T(1, 14, 0));
    expect(await reminder(id)).toMatchObject({ status: 'scheduled', reminder_at: T(1, 14, 30), lead_minutes: null });
    await tick(db(), T(1, 14, 29, 59));
    expect(await notifications(agent)).toEqual([]);
    await tick(db(), T(1, 14, 30, 5));
    expect(await reminder(id)).toMatchObject({ status: 'sent', reminder_at: T(1, 14, 30), delivered_at: T(1, 14, 30, 5) });
    expect(await notifications(agent)).toMatchObject([{ eventId: id, title: 'Quiz', kind: 'due' }]);
  });

  it('S07-3 AC-09.3 a due Reminder is shown in the app with no push set up, and Seen removes it', async () => {
    const { agent, userId } = await user();
    await event(userId, { date: D(1), time: '16:00' }, T(1, 14, 0));
    await tick(db(), T(1, 15, 30));
    const [shown] = await notifications(agent);
    expect(shown).toMatchObject({ title: 'Quiz', kind: 'due', date: D(1), time: '16:00' });
    expect((await agent.post(`/api/notifications/${shown.id}/seen`)).status).toBe(204);
    expect(await notifications(agent)).toEqual([]);
  });

  it('S07-2 AC-09.2 a deleted Event is never presented, even when EventDeleted is still in the outbox at tick time', async () => {
    const { agent, userId } = await user();
    const id = await event(userId, { date: D(2), time: '15:00' }, T(2, 10, 0));
    expect(await deleteConfirmed(db(), userId, id)).toBe(true); // publishes EventDeleted; no dispatch yet
    await tick(db(), T(2, 14, 30));
    expect(await reminder(id)).toBeUndefined();
    expect(await notifications(agent)).toEqual([]);
  });

  it('S07-4 AC-09.4 BR-08 no Reminder when its time has passed at confirm or edit; the same minute still counts', async () => {
    const { agent, userId } = await user();
    // Confirmed in the Reminder Time's own minute: scheduled, and a tick exactly 1 minute later is still on time.
    const sameMinute = await createManual(db(), userId, { title: 'Lab', date: D(3), time: '15:00' }, T(3, 14, 30, 20));
    if (!('id' in sameMinute)) throw new Error('not created');
    await tick(db(), T(3, 14, 31));
    expect(await reminder(sameMinute.id)).toMatchObject({ status: 'sent', reminder_at: T(3, 14, 30), delivered_at: T(3, 14, 31) });
    expect(await reminder(await event(userId, { date: D(3), time: '15:00' }, T(3, 14, 45)))).toMatchObject({ status: 'none' });
    const edited = await event(userId, { title: 'Viva', date: D(3), time: '18:00' }, T(3, 10, 0));
    await editConfirmed(db(), userId, edited, { time: '16:10' }, T(3, 15, 45));
    await tick(db(), T(3, 15, 45));
    expect(await reminder(edited)).toMatchObject({ status: 'none' });
    expect((await notifications(agent)).map((n) => n.title)).toEqual(['Lab']);
  });

  it('S07-5 AC-09.5 BR-07 an All-day Event is reminded at 08:30 on its date; 1 day gives 09:00 the day before', async () => {
    const { userId } = await user();
    const id = await event(userId, { date: D(5), time: null }, T(4, 7, 0));
    expect(await reminder(id)).toMatchObject({ status: 'scheduled', reminder_at: T(5, 8, 30) });
    const state = await setEventReminder(db(), userId, id, { leadMinutes: 1440 }, T(4, 7, 0));
    expect(state).toMatchObject({ leadMinutes: 1440, reminderAt: T(4, 9, 0).toISOString(), status: 'scheduled' });
  });

  it('S07-6 AC-10.1 after the default becomes 1 hour, a new Event is reminded 1 hour before (dispatched before the route answers)', async () => {
    const { agent } = await user();
    expect((await agent.put('/api/settings/reminders').send({ defaultLeadMinutes: 60 })).body).toEqual({ defaultLeadMinutes: 60 });
    expect((await agent.get('/api/settings/reminders')).body).toEqual({ defaultLeadMinutes: 60 });
    const tomorrow = new Date(Date.now() + 5 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
    const made = await agent.post('/api/events').send({ title: 'Seminar', date: tomorrow, time: '18:00' });
    const read = await agent.get(`/api/events/${made.body.id}`);
    expect(read.body.reminder).toMatchObject({ leadMinutes: null, defaultLeadMinutes: 60, status: 'scheduled' });
    expect(read.body.reminder.reminderAt).toBe(pktToUtc(...(tomorrow.split('-').map(Number) as [number, number, number]), 17, 0).toISOString());
  });

  it('S07-7 AC-10.2 a Reminder turned off is never presented; turned back on it is scheduled again', async () => {
    const { agent, userId } = await user();
    const id = await event(userId, { date: D(7), time: '15:00' }, T(7, 10, 0));
    expect(await setEventReminder(db(), userId, id, { enabled: false }, T(7, 10, 0))).toMatchObject({ enabled: false, status: 'off', reminderAt: null });
    await tick(db(), T(7, 14, 30));
    expect(await notifications(agent)).toEqual([]);
    await setEventReminder(db(), userId, id, { enabled: true, leadMinutes: 10 }, T(7, 14, 31));
    expect(await reminder(id)).toMatchObject({ status: 'scheduled', reminder_at: T(7, 14, 50), lead_minutes: 10 });
    await tick(db(), T(7, 14, 50));
    expect(await notifications(agent)).toHaveLength(1);
  });

  it('S07-8 AC-10.3 AC-10.4 BR-19 a default change moves Events on the default and keeps an own Lead Time', async () => {
    const { userId } = await user();
    const onDefault = await event(userId, { date: D(8), time: '15:00' }, T(8, 9, 0));
    const own = await event(userId, { title: 'Lab', date: D(8), time: '15:00' }, T(8, 9, 0));
    await setEventReminder(db(), userId, own, { leadMinutes: 10 }, T(8, 9, 0));
    expect(await setDefaultLeadTime(db(), userId, { defaultLeadMinutes: 60 }, T(8, 9, 30))).toEqual({ defaultLeadMinutes: 60 });
    expect(await reminder(onDefault)).toMatchObject({ reminder_at: T(8, 14, 0), status: 'scheduled' });
    expect(await reminder(own)).toMatchObject({ reminder_at: T(8, 14, 50), lead_minutes: 10 });
    // Q-28: a default that puts the Reminder Time in the past gives none; a later one schedules it again.
    await setDefaultLeadTime(db(), userId, { defaultLeadMinutes: 1440 }, T(8, 9, 30));
    expect(await reminder(onDefault)).toMatchObject({ status: 'none' });
    await setDefaultLeadTime(db(), userId, { defaultLeadMinutes: 10 }, T(8, 9, 30));
    expect(await reminder(onDefault)).toMatchObject({ status: 'scheduled', reminder_at: T(8, 14, 50) });
  });

  it('S07-9 AC-12.1 editing the time moves the Reminder; a title change alone keeps it', async () => {
    const { userId } = await user();
    const id = await event(userId, { date: D(9), time: '15:00' }, T(9, 9, 0));
    await editConfirmed(db(), userId, id, { time: '17:00' }, T(9, 9, 5));
    await tick(db(), T(9, 9, 5));
    expect(await reminder(id)).toMatchObject({ reminder_at: T(9, 16, 30), status: 'scheduled' });
    await editConfirmed(db(), userId, id, { title: 'Midterm' }, T(9, 9, 6));
    await tick(db(), T(9, 9, 6));
    expect(await reminder(id)).toMatchObject({ reminder_at: T(9, 16, 30), status: 'scheduled' });
  });

  it('S07-10 NFR-03 Q-23 up to 10 minutes late is presented late; later is recorded as missed', async () => {
    const { agent, userId } = await user();
    const late = await event(userId, { title: 'Late', date: D(10), time: '15:00' }, T(10, 9, 0));
    const missed = await event(userId, { title: 'Missed', date: D(10), time: '14:59' }, T(10, 9, 0));
    await tick(db(), T(10, 14, 40));
    expect(await reminder(late)).toMatchObject({ status: 'late', delivered_at: T(10, 14, 40) });
    expect(await reminder(missed)).toMatchObject({ status: 'missed', delivered_at: T(10, 14, 40) });
    expect((await notifications(agent)).map((n) => [n.title, n.kind])).toEqual([
      ['Missed', 'missed'],
      ['Late', 'late'],
    ]);
  });

  it('S07-11 two ticks in the same minute present a Reminder once; each message reaches each subscriber once', async () => {
    const { agent, userId } = await user();
    const made = await createManual(db(), userId, { title: 'Once', date: D(11), time: '15:00' }, T(11, 9, 0));
    if (!('id' in made)) throw new Error('not created');
    await Promise.all([tick(db(), T(11, 9, 0)), tick(db(), T(11, 9, 0))]);
    await Promise.all([tick(db(), T(11, 14, 30)), tick(db(), T(11, 14, 30, 30))]);
    expect(await notifications(agent)).toHaveLength(1);
    const deliveries = await db().query(
      `select d.subscriber from outbox_deliveries d join outbox o on o.id = d.outbox_id where o.payload->>'eventId' = $1`,
      [made.id],
    );
    expect(deliveries.rows).toEqual([{ subscriber: 'reminders' }]);
  });

  it('S07-15 BR-11 two Users: no access to another User\'s Reminder or notification; limits are checked', async () => {
    const a = await user();
    const b = await user();
    const id = await event(a.userId, { date: D(1), time: '17:00' }, T(1, 14, 0));
    await tick(db(), T(1, 16, 30));
    const [shown] = await notifications(a.agent);
    expect((await b.agent.put(`/api/events/${id}/reminder`).send({ enabled: false })).status).toBe(404);
    expect((await b.agent.post(`/api/notifications/${shown.id}/seen`)).status).toBe(404);
    expect(await notifications(b.agent)).toEqual([]);
    expect((await b.agent.put('/api/settings/reminders').send({ defaultLeadMinutes: 15 })).status).toBe(400);
    for (const bad of [0, 15, 45, '30', null]) {
      expect((await a.agent.put(`/api/events/${id}/reminder`).send({ leadMinutes: bad === null ? 'x' : bad })).status).toBe(400);
    }
    expect((await a.agent.put(`/api/events/${id}/reminder`).send({ enabled: 'no' })).status).toBe(400);
    expect((await a.agent.put(`/api/events/${id}/reminder`).send({ leadMinutes: null })).status).toBe(200);
    expect((await a.agent.put('/api/events/not-an-id/reminder').send({ enabled: false })).status).toBe(404);
    expect((await b.agent.get('/api/settings/reminders')).body).toEqual({ defaultLeadMinutes: 30 });
  });
});

describe.skipIf(!hasDb)('timed deletions (BR-05, BR-14)', () => {
  const chat = () => ({ id: randomUUID(), name: 'Timer Class', colour: 2 });
  const ingest = (userId: string, text: string, sentAt: Date) =>
    withTransaction(db(), (tx) => ingestMessages(userId, chat(), [{ sentAt, sender: 'Usman', text }], tx, sentAt));
  const messages = async (userId: string) => Number((await db().query('select count(*) from source_messages where user_id = $1', [userId])).rows[0].count);

  it('S07-12 AC-06.6 a dated Detected Event goes at the end of its date with its Source Message; confirm cancels the job', async () => {
    const { userId } = await user();
    await ingest(userId, 'Meeting tomorrow at 3pm in Room 4', T(12, 10, 0));
    await ingest(userId, 'Quiz tomorrow at 9am', T(12, 10, 0));
    const [meeting, quiz] = (await listDetected(db(), userId)).sort((x, y) => x.title.localeCompare(y.title));
    expect([meeting.title, meeting.date, quiz.title]).toEqual(['Meeting', D(13), 'Quiz']);
    expect(await confirm(db(), userId, quiz.id, T(12, 11, 0))).toMatchObject({ title: 'Quiz' });
    const job = await db().query("select status from jobs where dedupe_key = $1 and type = 'events.expireDetected'", [quiz.id]);
    expect(job.rows).toEqual([{ status: 'cancelled' }]);
    await tick(db(), T(13, 23, 59, 59));
    expect((await listDetected(db(), userId)).map((e) => e.title)).toEqual(['Meeting']);
    await tick(db(), T(14, 0, 0));
    expect(await listDetected(db(), userId)).toEqual([]);
    expect(await messages(userId)).toBe(0);
  });

  it('S07-12 a review that moves the date moves the expiry', async () => {
    const { userId } = await user();
    await ingest(userId, 'Meeting tomorrow at 3pm in Room 4', T(16, 10, 0));
    const [meeting] = await listDetected(db(), userId);
    await review(db(), userId, meeting.id, { date: D(18) });
    await tick(db(), T(18, 0, 0)); // the old expiry (end of 17 June)
    expect(await listDetected(db(), userId)).toHaveLength(1);
    await tick(db(), T(19, 0, 0));
    expect(await listDetected(db(), userId)).toEqual([]);
  });

  it('S07-13 AC-05.11 a Needs date Detected Event goes 7 days after the message, with its Source Message', async () => {
    const { userId } = await user();
    await ingest(userId, 'agle hafte presentation hai', T(20, 10, 0));
    expect((await listDetected(db(), userId)).map((e) => [e.title, e.date])).toEqual([['Presentation', null]]);
    await tick(db(), T(27, 9, 59, 59));
    expect(await listDetected(db(), userId)).toHaveLength(1);
    await tick(db(), T(27, 10, 0));
    expect(await listDetected(db(), userId)).toEqual([]);
    expect(await messages(userId)).toBe(0);
  });
});

describe.skipIf(!hasDb)('tick route (ADR-002)', () => {
  it('S07-14 a missing or wrong secret answers 404; the right Bearer secret runs the tick and answers counts only', async () => {
    process.env.TICK_SECRET ??= 'test-tick-secret';
    // The route ticks at new Date(); pin it to June 2020 so this tick cannot race other test files' rows.
    vi.useFakeTimers({ toFake: ['Date'], now: T(28, 0, 0) });
    expect((await request(app).post('/internal/tick')).status).toBe(404);
    expect((await request(app).post('/internal/tick').set('Authorization', 'Bearer wrong')).status).toBe(404);
    expect((await request(app).post('/internal/tick').set('Authorization', process.env.TICK_SECRET)).status).toBe(404);
    const ok = await request(app).post('/internal/tick').set('Authorization', `Bearer ${process.env.TICK_SECRET}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ outbox: expect.any(Number), jobs: expect.any(Number), tasks: { 'reminders.deliverDue': expect.any(Number) } });
    vi.useRealTimers();
  });
});

// S10: web push (FR-09, C-05). Times are in July 2020, after every June 2020 tick above, so these ticks reach only rows from these tests.
const J = (day: number, h: number, m: number, s = 0) => new Date(pktToUtc(2020, 7, day, h, m).getTime() + s * 1000);
const JD = (day: number) => `2020-07-${String(day).padStart(2, '0')}`;
const sub = (name: string) => ({ endpoint: `https://push.example.test/${name}-${randomUUID()}`, keys: { p256dh: 'BPublicKeyOfThisBrowser', auth: 'authSecret' } });

type Pushed = { endpoint: string; payload: { title: string; body: string; tag: string; url: string } };

/** A fake push service that records each push and answers `status` (or the status for that endpoint). */
function fakePush(status: number | ((endpoint: string) => number) = 201): Pushed[] {
  const sent: Pushed[] = [];
  const sender: PushSender = async (s, payload) => {
    sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    return typeof status === 'number' ? status : status(s.endpoint);
  };
  setPushSender(sender);
  return sent;
}

async function subscribe(agent: request.Agent, body: object = sub('phone')) {
  const res = await agent.post('/api/push-subscriptions').send(body);
  return { status: res.status, id: res.body.id as string, body: res.body };
}

const subscriptionRows = async (userId: string) =>
  (await db().query<{ endpoint: string }>('select endpoint from push_subscriptions where user_id = $1 order by created_at, endpoint', [userId])).rows.map((r) => r.endpoint);

describe.skipIf(!hasDb)('push routes (S10)', () => {
  it('S10-1 the public key is answered when the VAPID keys are set, 404 when not, 401 signed out', async () => {
    const { agent } = await user();
    vi.stubEnv('VAPID_PUBLIC_KEY', 'BTestPublicKey');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'test-private');
    vi.stubEnv('VAPID_SUBJECT', 'https://kalender.example.test');
    expect((await agent.get('/api/push/public-key')).body).toEqual({ publicKey: 'BTestPublicKey' });
    expect((await request(app).get('/api/push/public-key')).status).toBe(401);
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const off = await agent.get('/api/push/public-key');
    expect(off.status).toBe(404);
    expect(off.body).toEqual({ error: 'push_not_configured' });
    vi.unstubAllEnvs();
  });

  it('S10-2 a valid subscription answers 201; the endpoint is checked at its boundaries; the same endpoint keeps one row and moves User', async () => {
    const a = await user();
    const b = await user();
    const prefix = 'https://push.example.test/';
    const at1000 = { ...sub('x'), endpoint: prefix + 'a'.repeat(1000 - prefix.length - 36) + randomUUID() };
    expect(at1000.endpoint).toHaveLength(1000);
    expect((await subscribe(a.agent, at1000)).status).toBe(201);
    const bad = [
      { ...sub('x'), endpoint: 'http://push.example.test/plain' },
      { ...sub('x'), endpoint: 'not a url' },
      { ...sub('x'), endpoint: at1000.endpoint + 'b' },
      { endpoint: sub('x').endpoint, keys: { p256dh: 'BKey' } },
      { endpoint: sub('x').endpoint, keys: { p256dh: 42, auth: 'x' } },
      {},
    ];
    for (const body of bad) {
      const res = await subscribe(a.agent, body);
      expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
      expect(res.body.error).toBe('invalid');
    }
    expect(await subscriptionRows(a.userId)).toEqual([at1000.endpoint]);
    const phone = sub('shared-phone');
    const first = await subscribe(a.agent, phone);
    expect((await subscribe(a.agent, phone)).id).toBe(first.id);
    expect((await subscriptionRows(a.userId)).sort()).toEqual([at1000.endpoint, phone.endpoint].sort());
    expect((await subscribe(b.agent, phone)).id).toBe(first.id);
    expect(await subscriptionRows(a.userId)).toEqual([at1000.endpoint]);
    expect(await subscriptionRows(b.userId)).toEqual([phone.endpoint]);
  });

  it("S10-3 a User deletes their own subscription; another User's id answers 404 and changes nothing", async () => {
    const a = await user();
    const b = await user();
    const { id } = await subscribe(a.agent);
    expect((await b.agent.delete(`/api/push-subscriptions/${id}`)).status).toBe(404);
    expect(await subscriptionRows(a.userId)).toHaveLength(1);
    expect((await a.agent.delete(`/api/push-subscriptions/${id}`)).status).toBe(204);
    expect(await subscriptionRows(a.userId)).toEqual([]);
    expect((await a.agent.delete(`/api/push-subscriptions/${id}`)).status).toBe(404);
  });
});

describe.skipIf(!hasDb)('push delivery (S10)', () => {
  it("S10-4 AC-09.1 Q-23, S10-7 BR-11: on-time and late Reminders go to each of the User's phones with title and time; missed ones and other Users get none", async () => {
    const sent = fakePush();
    const a = await user();
    const b = await user();
    const [p1, p2] = [sub('a-phone'), sub('a-tablet')];
    await subscribe(a.agent, p1);
    await subscribe(a.agent, p2);
    const bPhone = sub('b-phone');
    await subscribe(b.agent, bPhone);
    await event(a.userId, { title: 'Project meeting', date: JD(1), time: '17:00' }, J(1, 9, 0)); // Reminder 16:30
    await event(a.userId, { title: 'Viva', date: JD(1), time: '18:00' }, J(1, 9, 0)); // 17:30
    await event(a.userId, { title: 'Lab', date: JD(1), time: '19:00' }, J(1, 9, 0)); // 18:30
    await event(b.userId, { title: 'Other', date: JD(1), time: '17:00' }, J(1, 9, 0)); // b's own Reminder, pushed to b only

    await tick(db(), J(1, 16, 31)); // 1 minute after: on time
    const meeting = sent.filter((s) => s.payload.title === 'Project meeting');
    expect(meeting.map((s) => s.endpoint).sort()).toEqual([p1.endpoint, p2.endpoint].sort());
    expect(meeting[0].payload).toEqual({ title: 'Project meeting', body: 'Aaj, 5:00 pm', tag: expect.any(String), url: '/' });
    expect(sent.filter((s) => s.payload.title === 'Other').map((s) => s.endpoint)).toEqual([bPhone.endpoint]);

    await tick(db(), J(1, 17, 40)); // 10 minutes after: late, still pushed
    expect(sent.filter((s) => s.payload.title === 'Viva')).toHaveLength(2);
    await tick(db(), J(1, 18, 40, 1)); // 10 minutes and 1 second after: missed, in-app only
    expect(sent.filter((s) => s.payload.title === 'Lab')).toEqual([]);
    expect((await notifications(a.agent)).map((n) => [n.title, n.kind])).toEqual([
      ['Project meeting', 'due'],
      ['Viva', 'late'],
      ['Lab', 'missed'],
    ]);
    expect(sent.filter((s) => s.endpoint === bPhone.endpoint).map((s) => s.payload.title)).toEqual(['Other']);
    setPushSender(undefined);
  }, 120_000); // seeds two Users and many ticks; the Neon dev branch is slow (S05 section 6)

  it('S10-5 AC-09.3 C-05 a push that fails, or no push set up, never stops the in-app Reminder or its NFR-03 times', async () => {
    setPushSender(async () => {
      throw new Error('push service down');
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await user();
    await subscribe(a.agent);
    const id = await event(a.userId, { date: JD(2), time: '15:00' }, J(2, 9, 0));
    await tick(db(), J(2, 14, 30, 5));
    expect(await reminder(id)).toMatchObject({ status: 'sent', delivered_at: J(2, 14, 30, 5) });
    expect(await notifications(a.agent)).toMatchObject([{ eventId: id, kind: 'due' }]);
    errors.mockRestore();

    setPushSender(undefined);
    vi.stubEnv('VAPID_PRIVATE_KEY', ''); // no keys: push is off
    const b = await user();
    await subscribe(b.agent);
    const id2 = await event(b.userId, { date: JD(2), time: '16:00' }, J(2, 9, 0));
    await tick(db(), J(2, 15, 30));
    expect(await reminder(id2)).toMatchObject({ status: 'sent' });
    expect(await notifications(b.agent)).toMatchObject([{ eventId: id2, kind: 'due' }]);
    vi.unstubAllEnvs();
  });

  it('S10-6 404 and 410 delete the subscription; 500 and a timeout keep it; the log holds the status only', async () => {
    const answers: Record<string, number> = {};
    const sent = fakePush((endpoint) => answers[endpoint]);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await user();
    const phones = { gone410: sub('gone410'), gone404: sub('gone404'), error500: sub('error500'), timeout: sub('timeout') };
    const codes = { gone410: 410, gone404: 404, error500: 500, timeout: 0 };
    for (const [name, p] of Object.entries(phones)) {
      answers[p.endpoint] = codes[name as keyof typeof codes];
      await subscribe(a.agent, p);
    }
    await event(a.userId, { title: 'Secret plan', date: JD(3), time: '15:00' }, J(3, 9, 0));
    await tick(db(), J(3, 14, 30));
    expect(sent).toHaveLength(4);
    expect((await subscriptionRows(a.userId)).sort()).toEqual([phones.error500.endpoint, phones.timeout.endpoint].sort());
    const logged = errors.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('reminders.push'));
    expect(logged.map((l) => JSON.parse(l).status).sort()).toEqual([0, 500]);
    expect(logged.join(' ')).not.toMatch(/Secret plan|push\.example\.test/);
    errors.mockRestore();
    setPushSender(undefined);
  });

  it('S10 notification time text in PKT uses the in-app words: Aaj, Kal, Parson, then the date; All day', () => {
    const now = J(4, 23, 59);
    expect(whenText(JD(4), '09:05', now)).toBe('Aaj, 9:05 am');
    expect(whenText(JD(5), '12:00', now)).toBe('Kal, 12:00 pm');
    expect(whenText(JD(5), '00:30', now)).toBe('Kal, 12:30 am');
    expect(whenText(JD(6), null, now)).toBe('Parson, All day');
    expect(whenText(JD(10), null, now)).toBe('Fri 10 Jul, All day');
  });
});
