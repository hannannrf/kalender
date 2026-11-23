import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { pktToUtc } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import { approveChat } from './service';

afterAll(closePool);

const SAMPLES = join(__dirname, '../../../test/fixtures/exports/samples');
const sample = (name: string) => readFileSync(join(SAMPLES, name));
const SE3D = 'WhatsApp Chat with SE-3D Class.txt';

async function signedIn() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: uniqueEmail('chats'), password: 'kal-5-baje-meeting' });
  const me = await agent.get('/api/me');
  const user = await db().query<{ id: string }>('select id from users where email = $1', [me.body.email]);
  return { agent, userId: user.rows[0].id };
}

describe.skipIf(!hasDb)('chats (FR-02, BR-02, BR-15)', () => {
  it('AC-02.5 a new account has zero Approved Chats', async () => {
    const { agent } = await signedIn();
    const res = await agent.get('/api/chats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('AC-02.1 N1 approving SE-3D Class at 19 Oct 10:25:40 with 7 days reads exactly 6 messages', async () => {
    const { userId } = await signedIn();
    const now = new Date(pktToUtc(2026, 10, 19, 10, 25).getTime() + 40_000);
    const result = await approveChat(db(), userId, { bytes: sample(SE3D), filename: SE3D }, { confirmedName: 'SE-3D Class', lookBackDays: 7 }, now);
    expect(result).toMatchObject({ messagesRead: 6, detectedEvents: 2, noNewMessages: false, chat: { name: 'SE-3D Class', colour: 1 } });
    const row = await db().query('select start_point, read_up_to from approved_chats where user_id = $1', [userId]);
    expect(row.rows[0].start_point).toEqual(pktToUtc(2026, 10, 12, 10, 25));
    expect(row.rows[0].read_up_to).toEqual(pktToUtc(2026, 10, 19, 10, 25));
  });

  it('preview returns the Chat name from the file and stores nothing', async () => {
    const { agent, userId } = await signedIn();
    const res = await agent.post('/api/chats/preview').attach('file', sample(SE3D), SE3D);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chatNameFromFile: 'SE-3D Class' });
    expect((await db().query('select 1 from approved_chats where user_id = $1', [userId])).rowCount).toBe(0);
  });

  it('keeps emoji in a Chat name taken from the file name', async () => {
    const { agent } = await signedIn();
    const res = await agent.post('/api/chats/preview').attach('file', sample(SE3D), 'WhatsApp Chat with Cricket 🏏 Team.txt');
    expect(res.body).toEqual({ chatNameFromFile: 'Cricket 🏏 Team' });
  });

  it('approves with the confirmed name and Look-back, then lists the Chat', async () => {
    const { agent } = await signedIn();
    const res = await agent.post('/api/chats').field('name', ' Class group ').field('lookBackDays', '3').attach('file', sample(SE3D), SE3D);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ chat: { name: 'Class group', lookBackDays: 3, colour: 1 }, detectedEvents: 0 });
    const list = await agent.get('/api/chats');
    expect(list.body).toEqual([res.body.chat]);
  });

  it('AC-02.3 F2 refuses files that are not exports, with a reason, and creates no Chat', async () => {
    const { agent } = await signedIn();
    for (const name of ['notes.txt', 'WhatsApp Chat with Fake.txt']) {
      for (const path of ['/api/chats/preview', '/api/chats']) {
        const res = await agent.post(path).field('name', 'Fake').attach('file', sample(name), name);
        expect(res.status).toBe(422);
        expect(res.body.error).toBe('NOT_AN_EXPORT');
        expect(res.body.message).toBeTruthy();
      }
    }
    expect((await agent.get('/api/chats')).body).toEqual([]);
  });

  it('refuses an ambiguous file with NEEDS_DATE_ORDER and accepts it once the order is given', async () => {
    const { agent } = await signedIn();
    const file = 'WhatsApp Chat with Society Core.txt';
    const res = await agent.post('/api/chats').field('name', 'Society Core').attach('file', sample(file), file);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('NEEDS_DATE_ORDER');
    const ok = await agent.post('/api/chats').field('name', 'Society Core').field('dateOrder', 'DMY').attach('file', sample(file), file);
    expect(ok.status).toBe(201);
  });

  it('refuses a second active Chat with the same name from the file, and gives the next Chat the next colour', async () => {
    const { agent } = await signedIn();
    await agent.post('/api/chats').field('name', 'SE-3D Class').attach('file', sample(SE3D), SE3D);
    const again = await agent.post('/api/chats').field('name', 'Other').attach('file', sample(SE3D), 'WhatsApp Chat with SE-3D Class (1).txt');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('DUPLICATE_CHAT');
    const other = 'WhatsApp Chat with Ammi.txt';
    const second = await agent.post('/api/chats').field('name', 'Ammi').attach('file', sample(other), other);
    expect(second.body.chat.colour).toBe(2);
  });

  it('refuses a missing file, a missing name and a Look-back other than 1, 3 or 7', async () => {
    const { agent } = await signedIn();
    expect((await agent.post('/api/chats').field('name', 'x')).status).toBe(400);
    const bad = await agent.post('/api/chats').field('name', '  ').field('lookBackDays', '2').attach('file', sample(SE3D), SE3D);
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields)).toEqual(['name', 'lookBackDays']);
  });

  it('refuses a file over 4 MB with TOO_LARGE', async () => {
    const { agent } = await signedIn();
    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 'a');
    const res = await agent.post('/api/chats/preview').attach('file', big, SE3D);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('TOO_LARGE');
  });

  it('BR-11 User B never sees User A\'s Chats', async () => {
    const a = await signedIn();
    const b = await signedIn();
    await a.agent.post('/api/chats').field('name', 'SE-3D Class').attach('file', sample(SE3D), SE3D);
    expect((await b.agent.get('/api/chats')).body).toEqual([]);
    // The same Chat name is free for another User.
    expect((await b.agent.post('/api/chats').field('name', 'SE-3D Class').attach('file', sample(SE3D), SE3D)).status).toBe(201);
  });

  it('NFR-01 stores no message text or sender, only fingerprints', async () => {
    const { userId } = await signedIn();
    const now = new Date(pktToUtc(2026, 10, 19, 10, 26).getTime());
    await approveChat(db(), userId, { bytes: sample(SE3D), filename: SE3D }, { confirmedName: 'SE-3D Class', lookBackDays: 7 }, now);
    const row = await db().query('select * from approved_chats where user_id = $1', [userId]);
    const stored = JSON.stringify(row.rows);
    for (const fragment of ['Meeting tomorrow', 'noted', 'CR Usman', 'Hira', 'Room 4']) expect(stored).not.toContain(fragment);
    expect(Object.keys(row.rows[0].boundary)).toEqual(expect.arrayContaining([expect.stringMatching(/^[0-9a-f]{64}$/)]));
  });

  it('needs a session', async () => {
    expect((await request(app).get('/api/chats')).status).toBe(401);
    expect((await request(app).post('/api/chats/preview').attach('file', sample(SE3D), SE3D)).status).toBe(401);
  });
});
