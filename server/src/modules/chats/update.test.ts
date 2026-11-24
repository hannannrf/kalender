// S05: update an Approved Chat, iPhone .zip, date order, list, Revoke (FR-03, FR-04, BR-02, BR-06, BR-15).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { pktToUtc } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import * as events from '../events';
import { approveChat, revokeChat, updateChat, type Approved } from './service';

afterAll(closePool);

const SAMPLES = join(__dirname, '../../../test/fixtures/exports/samples');
const sample = (name: string) => readFileSync(join(SAMPLES, name));
const SE3D = 'WhatsApp Chat with SE-3D Class.txt';
const ZIP = 'WhatsApp Chat - ISE Project Team.zip';
const APPROVED_AT = new Date(pktToUtc(2026, 10, 19, 10, 25).getTime() + 40_000); // fixtures/README.md
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

async function signedIn() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: uniqueEmail('chats-s05'), password: 'kal-5-baje-meeting' });
  const me = await agent.get('/api/me');
  const user = await db().query<{ id: string }>('select id from users where email = $1', [me.body.email]);
  return { agent, userId: user.rows[0].id };
}

async function approveSe3d(userId: string): Promise<Approved> {
  const result = await approveChat(db(), userId, { bytes: sample(SE3D), filename: SE3D }, { confirmedName: 'SE-3D Class', lookBackDays: 7 }, APPROVED_AT);
  if ('refused' in result) throw new Error(result.refused);
  return result;
}

const pointers = async (chatId: string) =>
  (await db().query('select read_up_to, boundary, last_upload_at, revoked_at from approved_chats where id = $1', [chatId])).rows[0];

describe.skipIf(!hasDb)('chats update and Revoke (S05)', () => {
  it('AC-03.1 B1: the v2 export on 22 Oct reads exactly the 3 messages not read before, and moves the pointers', async () => {
    const { userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    const at = pktToUtc(2026, 10, 22, 9, 0);
    const result = await updateChat(db(), userId, chat.id, { bytes: sample(`v2/${SE3D}`), filename: SE3D }, at);
    expect(result).toMatchObject({ messagesRead: 3, noNewMessages: false, chat: { id: chat.id, lastUploadAt: at.toISOString() } });
    const p = await pointers(chat.id);
    expect(p.read_up_to).toEqual(pktToUtc(2026, 10, 21, 19, 31));
    expect(p.last_upload_at).toEqual(at);
  });

  it('S05-6 BR-02: the same export again reads nothing and says so; the last upload time still moves', async () => {
    const { userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    await updateChat(db(), userId, chat.id, { bytes: sample(`v2/${SE3D}`), filename: SE3D }, pktToUtc(2026, 10, 22, 9, 0));
    const before = await pointers(chat.id);
    const at = pktToUtc(2026, 10, 22, 10, 0);
    const again = await updateChat(db(), userId, chat.id, { bytes: sample(`v2/${SE3D}`), filename: SE3D }, at);
    expect(again).toMatchObject({ messagesRead: 0, detectedEvents: 0, noNewMessages: true });
    const after = await pointers(chat.id);
    expect(after.read_up_to).toEqual(before.read_up_to);
    expect(after.boundary).toEqual(before.boundary);
    expect(after.last_upload_at).toEqual(at);
  });

  it('AC-03.2 F1: the Ammi export is refused as WRONG_CHAT and nothing moves; a " (1)" copy of the right file is read', async () => {
    const { agent, userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    const before = await pointers(chat.id);
    const res = await agent.post(`/api/chats/${chat.id}/uploads`).attach('file', sample('WhatsApp Chat with Ammi.txt'), 'WhatsApp Chat with Ammi.txt');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'WRONG_CHAT', message: expect.stringContaining('SE-3D Class') });
    expect(await pointers(chat.id)).toEqual(before);
    const copy = await updateChat(db(), userId, chat.id, { bytes: sample(`v2/${SE3D}`), filename: 'WhatsApp Chat with SE-3D Class (1).txt' }, pktToUtc(2026, 10, 22, 9, 0));
    expect(copy).toMatchObject({ messagesRead: 3 });
  });

  it('S05-8 R2-6: an update uses the stored day/month order and refuses a file that proves month/day', async () => {
    const { userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    const mdy = new TextEncoder().encode('10/25/2026, 3:22 pm - Hira: quiz kal hai\n');
    const result = await updateChat(db(), userId, chat.id, { bytes: mdy, filename: SE3D }, pktToUtc(2026, 10, 26, 9, 0));
    expect(result).toMatchObject({ refused: 'DATE_ORDER_MISMATCH' });
  });

  it('AC-02.2 N2: the sample iPhone .zip approved at 19 Oct 10:25:40 with 3 days reads the 2 messages from Zain', async () => {
    const { agent, userId } = await signedIn();
    const result = await approveChat(db(), userId, { bytes: sample(ZIP), filename: ZIP }, { confirmedName: 'ISE Project Team', lookBackDays: 3 }, APPROVED_AT);
    expect(result).toMatchObject({ messagesRead: 2, chat: { name: 'ISE Project Team' } });
    const preview = await agent.post('/api/chats/preview').attach('file', sample(ZIP), ZIP);
    expect(preview.body).toEqual({ chatNameFromFile: 'ISE Project Team' });
  });

  it('S05-3 BR-15: a .zip with no chat in it is refused with a reason and no Chat is created', async () => {
    const { agent } = await signedIn();
    const empty = Buffer.from(zipSync({ 'photo.jpg': new Uint8Array([1, 2, 3]) }));
    const res = await agent.post('/api/chats').field('name', 'X').attach('file', empty, 'WhatsApp Chat - X.zip');
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'NOT_AN_EXPORT', message: expect.stringContaining('no WhatsApp chat') });
    expect((await agent.get('/api/chats')).body).toEqual([]);
  });

  it('AC-02.4 B2: after day/month is chosen, Society Core reads only the 12 Oct message', async () => {
    const { userId } = await signedIn();
    const file = 'WhatsApp Chat with Society Core.txt';
    const asked = await approveChat(db(), userId, { bytes: sample(file), filename: file }, { confirmedName: 'Society Core', lookBackDays: 7 }, APPROVED_AT);
    expect(asked).toMatchObject({ refused: 'NEEDS_DATE_ORDER' });
    const result = await approveChat(db(), userId, { bytes: sample(file), filename: file }, { confirmedName: 'Society Core', lookBackDays: 7, dateOrder: 'DMY' }, APPROVED_AT);
    expect(result).toMatchObject({ messagesRead: 1 });
  });

  it('AC-03.3: two Approved Chats are listed with their Approval Time and last upload time', async () => {
    const { agent, userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    await approveChat(db(), userId, { bytes: sample(ZIP), filename: ZIP }, { confirmedName: 'ISE Project Team', lookBackDays: 3 }, APPROVED_AT);
    const at = pktToUtc(2026, 10, 22, 9, 0);
    await updateChat(db(), userId, chat.id, { bytes: sample(`v2/${SE3D}`), filename: SE3D }, at);
    const list = (await agent.get('/api/chats')).body as { name: string; approvedAt: string; lastUploadAt: string }[];
    expect(list.map((c) => [c.name, c.approvedAt, c.lastUploadAt]).sort()).toEqual([
      ['ISE Project Team', APPROVED_AT.toISOString(), APPROVED_AT.toISOString()],
      ['SE-3D Class', APPROVED_AT.toISOString(), at.toISOString()],
    ]);
  });

  it('AC-04.1 BR-06: Revoke deletes Detected Events, their message text and expiry jobs; Confirmed Events stay', async () => {
    const { agent, userId } = await signedIn();
    const { chat, detectedEvents } = await approveSe3d(userId);
    expect(detectedEvents).toBe(2);
    const detected = await events.listDetected(db(), userId);
    const kept = detected.find((d) => d.uncertain.length === 0) ?? detected[0];
    if (kept.uncertain.length) await events.review(db(), userId, kept.id, { accept: kept.uncertain });
    expect(await events.confirm(db(), userId, kept.id, APPROVED_AT)).toMatchObject({ title: kept.title });
    const ids = detected.filter((d) => d.id !== kept.id).map((d) => d.id);

    expect((await agent.delete(`/api/chats/${chat.id}`)).status).toBe(204);

    const count = async (sql: string, args: unknown[]) => Number((await db().query(sql, args)).rows[0].n);
    expect(await count('select count(*) n from detected_events where chat_id = $1', [chat.id])).toBe(0);
    expect(await count('select count(*) n from source_messages where chat_id = $1', [chat.id])).toBe(0);
    expect(await count(`select count(*) n from jobs where dedupe_key = any($1) and status = 'pending'`, [ids])).toBe(0);
    const confirmed = await db().query('select chat_name, chat_colour from confirmed_events where user_id = $1', [userId]);
    expect(confirmed.rows).toEqual([{ chat_name: 'SE-3D Class', chat_colour: chat.colour }]);
    const p = await pointers(chat.id);
    expect(p.read_up_to).toBeNull();
    expect(p.revoked_at).not.toBeNull();
    expect((await agent.get('/api/chats')).body).toEqual([]);
  });

  it('AC-04.2 F3 R2-15: after Revoke an update is refused; approving again makes a new Chat with a new Start Point', async () => {
    const { agent, userId } = await signedIn();
    const { chat } = await approveSe3d(userId);
    expect(await revokeChat(db(), userId, chat.id, pktToUtc(2026, 10, 20, 9, 0))).toBe(true);
    const res = await agent.post(`/api/chats/${chat.id}/uploads`).attach('file', sample(`v2/${SE3D}`), SE3D);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('CHAT_NOT_APPROVED');
    expect((await pointers(chat.id)).read_up_to).toBeNull();
    expect(await revokeChat(db(), userId, chat.id, pktToUtc(2026, 10, 20, 9, 1))).toBe(false);

    const again = pktToUtc(2026, 10, 22, 9, 0);
    const result = await approveChat(db(), userId, { bytes: sample(`v2/${SE3D}`), filename: SE3D }, { confirmedName: 'SE-3D Class', lookBackDays: 1 }, again);
    expect(result).toMatchObject({ chat: { approvedAt: again.toISOString() }, messagesRead: 1 }); // only 21 Oct 7:31 pm
    expect((result as Approved).chat.id).not.toBe(chat.id);
  });

  it('BR-11: another User\'s Chat, an unknown id and a malformed id all answer 404 and change nothing', async () => {
    const a = await signedIn();
    const b = await signedIn();
    const { chat } = await approveSe3d(a.userId);
    const before = await pointers(chat.id);
    for (const id of [chat.id, UNKNOWN, 'not-an-id']) {
      expect((await b.agent.post(`/api/chats/${id}/uploads`).attach('file', sample(`v2/${SE3D}`), SE3D)).status).toBe(404);
      expect((await b.agent.delete(`/api/chats/${id}`)).status).toBe(404);
    }
    expect(await pointers(chat.id)).toEqual(before);
  });

  it('needs a session', async () => {
    expect((await request(app).delete(`/api/chats/${UNKNOWN}`)).status).toBe(401);
    expect((await request(app).post(`/api/chats/${UNKNOWN}/uploads`).attach('file', sample(SE3D), SE3D)).status).toBe(401);
  });
});
