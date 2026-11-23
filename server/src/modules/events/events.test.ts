import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { pktToUtc } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import { approveChat } from '../chats';

afterAll(closePool);

const SE3D = 'WhatsApp Chat with SE-3D Class.txt';
const se3d = readFileSync(join(__dirname, '../../../test/fixtures/exports/samples', SE3D));
const APPROVED_AT = new Date(pktToUtc(2026, 10, 19, 10, 25).getTime() + 40_000); // 19 Oct 2026 10:25:40 PKT

async function signedIn() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: uniqueEmail('events'), password: 'kal-5-baje-meeting' });
  const me = await agent.get('/api/me');
  const user = await db().query<{ id: string }>('select id from users where email = $1', [me.body.email]);
  return { agent, userId: user.rows[0].id };
}

const approveSe3d = (userId: string) =>
  approveChat(db(), userId, { bytes: se3d, filename: SE3D }, { confirmedName: 'SE-3D Class', lookBackDays: 7 }, APPROVED_AT);

describe.skipIf(!hasDb)('Detected Events (FR-05, BR-05, BR-11)', () => {
  it('S03-14 approving SE-3D Class stores exactly the 2 upcoming Detected Events and their 2 Source Messages', async () => {
    const { agent, userId } = await signedIn();
    expect(await approveSe3d(userId)).toMatchObject({ messagesRead: 6, detectedEvents: 2 });

    const res = await agent.get('/api/detected-events');
    expect(res.status).toBe(200);
    const chat = { name: 'SE-3D Class', colour: 1 };
    expect(res.body).toMatchObject([
      { chat, title: 'Meeting', date: '2026-10-20', time: '15:00', place: 'Room 4', uncertain: [] },
      { chat, title: 'OOP lab', date: '2026-10-21', time: '14:00', place: 'Room C-204', uncertain: [] },
    ]);

    // AC-05.4 / BR-05: the 4 read messages with no Event ("anyone has the slides?", "noted", ...) are not stored,
    // and R2-2: the proposal due Friday 16 Oct was already past at upload, so neither it nor its message is stored.
    const kept = await db().query<{ text: string }>('select text from source_messages where user_id = $1 order by sent_at', [userId]);
    expect(kept.rows.map((r) => r.text)).toEqual(['Reminder:\nOOP lab moved to Wednesday 21/10 at 2pm\nRoom C-204', 'Meeting tomorrow at 3pm in Room 4']);
  });

  it('a Chat approved after every Event has passed stores nothing', async () => {
    const { agent } = await signedIn();
    const res = await agent.post('/api/chats').field('name', 'SE-3D Class').attach('file', se3d, SE3D);
    expect(res.status).toBe(201);
    expect(res.body.detectedEvents).toBe(0);
    expect((await agent.get('/api/detected-events')).body).toEqual([]);
  });

  it('S03-15 BR-11 a User sees only their own Detected Events', async () => {
    const owner = await signedIn();
    await approveSe3d(owner.userId);
    const other = await signedIn();
    expect((await other.agent.get('/api/detected-events')).body).toEqual([]);
    expect((await owner.agent.get('/api/detected-events')).body).toHaveLength(2);
  });

  it('refuses the list when signed out', async () => {
    expect((await request(app).get('/api/detected-events')).status).toBe(401);
  });
});
