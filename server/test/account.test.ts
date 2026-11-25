// S09: delete the account and everything it owns (FR-13, MF-07, AC-13.1, AC-13.3, BR-11).
// Cross-module (identity, chats, events, reminders, jobs), so it lives in server/test (AGENTS.md section 3).
// Uploads are written relative to the real clock, because the routes use the current time.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import type { Job, Registry } from '../src/modules/jobs';
import { finishDeletion, register, requestDeletion } from '../src/modules/identity/service';
import { closePool, db, withTransaction } from '../src/shared/db';
import { pktParts } from '../src/shared/time';
import { hasDb, uniqueEmail } from './db';

afterAll(closePool);

const PASSWORD = 'kal-5-baje-meeting';
const SENT = new Date(Date.now() - 30 * 60_000);
const OWNED = ['sessions', 'approved_chats', 'source_messages', 'detected_events', 'confirmed_events', 'reminders', 'reminder_settings', 'in_app_notifications', 'jobs', 'outbox'];

/** One Android export line sent at SENT, in the 12-hour PKT format. */
function line(text: string) {
  const { date, time } = pktParts(SENT);
  const [y, m, d] = date.split('-');
  const [h, min] = time.split(':').map(Number);
  return `${d}/${m}/${y}, ${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} - Usman: ${text}`;
}

const exportFile = (...texts: string[]) => Buffer.from(texts.map(line).join('\n') + '\n');

async function user() {
  const agent = request.agent(app);
  const email = uniqueEmail('account');
  expect((await agent.post('/api/auth/register').send({ email, password: PASSWORD })).status).toBe(201);
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
  return { agent, email, userId };
}

async function approve(agent: request.Agent, name: string, file: Buffer) {
  const res = await agent.post('/api/chats').field('name', name).field('lookBackDays', '1').field('dateOrder', 'DMY').attach('file', file, `WhatsApp Chat with ${name}.txt`);
  expect(res.status).toBe(201);
  return res.body.chat.id as string;
}

/** A User with data of every kind (S09-2): an active and a Revoked Chat, Detected and Confirmed Events, settings and a notification. */
async function fullUser() {
  const u = await user();
  await approve(u.agent, 'Delete Class', exportFile('Meeting tomorrow at 3pm in Room 4', 'agle hafte presentation hai'));
  const revoked = await approve(u.agent, 'Old Class', exportFile('quiz kal 9am'));
  expect((await u.agent.delete(`/api/chats/${revoked}`)).status).toBe(204);
  const meeting = ((await u.agent.get('/api/detected-events')).body as { id: string; title: string }[]).find((e) => e.title === 'Meeting')!;
  expect((await u.agent.post(`/api/detected-events/${meeting.id}/confirm`)).status).toBe(201);
  expect((await u.agent.post('/api/events').send({ title: 'Study group', date: pktParts(new Date(Date.now() + 86_400_000)).date })).status).toBe(201);
  expect((await u.agent.put('/api/settings/reminders').send({ defaultLeadMinutes: 60 })).status).toBe(200);
  await db().query(
    `insert into in_app_notifications (user_id, event_id, title, date, reminder_at, kind) values ($1, gen_random_uuid(), 'Meeting', current_date, now(), 'due')`,
    [u.userId],
  );
  return u;
}

/** Rows that hold this User's id, per table. */
async function rows(userId: string): Promise<Record<string, number>> {
  const count = async (sql: string) => Number((await db().query(sql, [userId])).rows[0].n);
  const out: Record<string, number> = { users: await count('select count(*) n from users where id = $1') };
  for (const table of OWNED) out[table] = await count(`select count(*) n from ${table} where user_id = $1`);
  return out;
}

const none = Object.fromEntries(['users', ...OWNED].map((t) => [t, 0]));

/** The registered handler and tick task, reached the way the tick reaches them. */
function registered() {
  const handlers: Record<string, Parameters<Registry['registerHandler']>[1]> = {};
  const tasks: Record<string, Parameters<Registry['registerTickTask']>[1]> = {};
  register({ registerHandler: (type, fn) => (handlers[type] = fn), registerTickTask: (name, fn) => (tasks[name] = fn), subscribe: () => {} } as Registry);
  return { handlers, tasks };
}

describe.skipIf(!hasDb)('delete the account (FR-13, MF-07)', () => {
  it('S09-2 AC-13.3, S09-3 BR-11: no row with the User\'s id is left in any table; another User keeps everything', async () => {
    const gone = await fullUser();
    const other = await fullUser();
    const seeded = await rows(gone.userId);
    for (const table of ['users', ...OWNED]) expect(seeded[table], table).toBeGreaterThan(0);
    expect(seeded.approved_chats).toBe(2);
    const otherBefore = await rows(other.userId);

    expect((await gone.agent.delete('/api/account').send({ password: PASSWORD })).status).toBe(204);
    expect(await rows(gone.userId)).toEqual(none);
    expect(await rows(other.userId)).toEqual(otherBefore);
  });

  it('S09-1 AC-13.1: afterwards the old session, approving, updating and signing in all answer 401', async () => {
    const { agent, email } = await user();
    const chatId = await approve(agent, 'Gone Class', exportFile('anyone has the slides?'));
    const res = await agent.delete('/api/account').send({ password: PASSWORD });
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/kalender_session=;/);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect((await agent.post('/api/chats').field('name', 'X').attach('file', exportFile('hi'), 'WhatsApp Chat with X.txt')).status).toBe(401);
    expect((await agent.post(`/api/chats/${chatId}/uploads`).attach('file', exportFile('hi'), 'WhatsApp Chat with Gone Class.txt')).status).toBe(401);
    expect((await request(app).post('/api/auth/sign-in').send({ email, password: PASSWORD })).status).toBe(401);
    expect((await request(app).delete('/api/account').send({ password: PASSWORD })).status).toBe(401);
  });

  it('S09-4: a wrong, empty or missing password answers 403 with a field message, and nothing changes', async () => {
    const { agent, userId } = await user();
    const before = await rows(userId);
    for (const body of [{ password: 'not-my-password' }, { password: '' }, {}]) {
      const res = await agent.delete('/api/account').send(body);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: 'wrong_password', fields: { password: expect.any(String) } });
    }
    expect((await agent.get('/api/me')).status).toBe(200);
    expect(await rows(userId)).toEqual(before);
  });

  it('S09-5 R2-9: after only the first step the User is refused, and the queued job removes the rest; steps run twice safely', async () => {
    const { agent, email, userId } = await fullUser();
    const now = new Date();
    await requestDeletion(db(), userId, now);
    expect((await agent.get('/api/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/sign-in').send({ email, password: PASSWORD })).status).toBe(401);

    const queued = await db().query('select id, payload, user_id, run_at from jobs where type = $1 and dedupe_key = $2 and status = $3', ['identity.resumeAccountDeletion', userId, 'pending']);
    expect(queued.rows).toMatchObject([{ payload: { userId }, user_id: null, run_at: new Date(now.getTime() + 5 * 60_000) }]);
    const job: Job = { id: queued.rows[0].id, type: 'identity.resumeAccountDeletion', payload: { userId }, userId: null, runAt: queued.rows[0].run_at };
    const { handlers } = registered();
    await withTransaction(db(), (tx) => handlers['identity.resumeAccountDeletion'](tx, job, job.runAt));
    expect(await rows(userId)).toEqual(none);
    await finishDeletion(db(), userId); // again: nothing left to do, no error
    await withTransaction(db(), (tx) => handlers['identity.resumeAccountDeletion'](tx, job, job.runAt));
    expect(await rows(userId)).toEqual(none);
  });

  it('S09-6 MF-07: the same email can register again and gets a new, empty account', async () => {
    const { agent, email, userId } = await user();
    await approve(agent, 'First Life', exportFile('Meeting tomorrow at 3pm'));
    expect((await agent.delete('/api/account').send({ password: PASSWORD })).status).toBe(204);
    const again = request.agent(app);
    expect((await again.post('/api/auth/register').send({ email, password: PASSWORD })).status).toBe(201);
    const newId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
    expect(newId).not.toBe(userId);
    expect((await again.get('/api/chats')).body).toEqual([]);
    expect((await again.get('/api/detected-events')).body).toEqual([]);
  });

  it('S09-7: purgeExpiredSessions deletes a session expired 1 second ago and keeps one expiring in 1 second', async () => {
    const { userId } = await user();
    const now = new Date();
    for (const [hash, ms] of [[`expired-${userId}`, -1000], [`current-${userId}`, 1000]] as const) {
      await db().query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [hash, userId, new Date(now.getTime() + ms)]);
    }
    await registered().tasks['identity.purgeExpiredSessions'](db(), now);
    const left = await db().query<{ token_hash: string }>('select token_hash from sessions where user_id = $1 and token_hash like $2', [userId, `%-${userId}`]);
    expect(left.rows.map((r) => r.token_hash)).toEqual([`current-${userId}`]);
  });
});
