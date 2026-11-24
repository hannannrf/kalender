// S06: Manual Events, edit and delete of Confirmed Events (FR-07, FR-12, BR-11, BR-16).
// Route tests use the real clock; the BR-16 "today" boundaries use the service with a fixed time.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { pktParts } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import { createManual } from './service';

afterAll(closePool);

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = Date.now();
const yesterday = pktParts(new Date(now - DAY)).date;
const tomorrow = pktParts(new Date(now + DAY)).date;
const inTwoDays = pktParts(new Date(now + 2 * DAY)).date;
const MISSING = '00000000-0000-4000-8000-000000000000';

async function user() {
  const agent = request.agent(app);
  const email = uniqueEmail('manual');
  await agent.post('/api/auth/register').send({ email, password: 'kal-5-baje-meeting' });
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [email])).rows[0].id;
  return { agent, userId };
}

async function manual(agent: request.Agent, body: object) {
  const res = await agent.post('/api/events').send(body);
  expect(res.status).toBe(201);
  return res.body as { id: string; title: string; date: string; time: string | null; place: string | null };
}

/** A Confirmed Event from an Approved Chat, so its Source Chat can be checked. */
async function fromChat(agent: request.Agent) {
  const { date, time } = pktParts(new Date(now - 30 * MIN));
  const [y, m, d] = date.split('-');
  const [h, min] = time.split(':').map(Number);
  const line = `${d}/${m}/${y}, ${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} - Usman: Meeting tomorrow at 3pm in Room 4\n`;
  const approved = await agent.post('/api/chats').field('name', 'Manual Class').field('dateOrder', 'DMY').attach('file', Buffer.from(line), 'WhatsApp Chat with Manual Class.txt');
  expect(approved.status).toBe(201);
  const [detected] = (await agent.get('/api/detected-events')).body;
  const res = await agent.post(`/api/detected-events/${detected.id}/confirm`);
  expect(res.status).toBe(201);
  return res.body;
}

describe.skipIf(!hasDb)('Manual Events (FR-07)', () => {
  it('S06-1 AC-07.1 a title and a future date create a Manual Event shown in the Events list', async () => {
    const { agent } = await user();
    const event = await manual(agent, { title: '  Group study  ', date: tomorrow, time: '18:00', place: 'Library' });
    expect(event).toMatchObject({ title: 'Group study', date: tomorrow, time: '18:00', place: 'Library', chat: { id: null, name: null, colour: null } });
    expect((await agent.get('/api/events')).body).toMatchObject([{ id: event.id, title: 'Group study', chat: { name: null } }]);
    expect(await manual(agent, { title: 'Fee deadline', date: tomorrow })).toMatchObject({ time: null, place: null });
  });

  it('S06-2 AC-07.2 an empty title or a past date is refused with the field and the reason', async () => {
    const { agent } = await user();
    const empty = await agent.post('/api/events').send({ title: '   ', date: tomorrow });
    expect(empty.status).toBe(400);
    expect(empty.body.fields).toEqual({ title: 'Enter a title of 1 to 60 characters.' });
    const past = await agent.post('/api/events').send({ title: 'Quiz', date: yesterday });
    expect(past.status).toBe(422);
    expect(past.body).toMatchObject({ error: 'PAST', fields: { date: 'This date has passed.' } });
    expect((await agent.get('/api/events')).body).toEqual([]);
  });

  it('S06-2 EP/BVA title, date, time and place limits', async () => {
    const { agent } = await user();
    const send = (body: object) => agent.post('/api/events').send({ title: 'Quiz', date: tomorrow, ...body });
    expect((await agent.post('/api/events').send({ date: tomorrow })).body.fields).toHaveProperty('title');
    expect((await send({ title: 'Q' })).status).toBe(201);
    expect((await send({ title: 'x'.repeat(60) })).status).toBe(201);
    expect((await send({ title: 'x'.repeat(61) })).status).toBe(400);
    expect((await agent.post('/api/events').send({ title: 'Quiz' })).body.fields).toEqual({ date: 'Enter a date.' });
    expect((await send({ date: '2026-02-30' })).body.fields).toEqual({ date: 'Enter a real date.' });
    expect((await send({ time: '24:00' })).status).toBe(400);
    expect((await send({ place: '' })).body).toMatchObject({ place: null });
    expect((await send({ place: 'p'.repeat(40) })).status).toBe(201);
    expect((await send({ place: 'p'.repeat(41) })).body.fields).toHaveProperty('place');
  });

  it('S06-3 BR-16 today is allowed All-day or at a time not yet passed, refused at a passed time', async () => {
    const { userId } = await user();
    const at = new Date('2026-11-24T10:30:20Z'); // 15:30:20 PKT
    const make = (time: string | null) => createManual(db(), userId, { title: 'Viva', date: '2026-11-24', time }, at);
    expect(await make('15:29')).toMatchObject({ refused: 'PAST', fields: { time: 'This time has passed.' } });
    expect(await make('15:30')).toMatchObject({ time: '15:30' });
    expect(await make('15:31')).toMatchObject({ time: '15:31' });
    expect(await make(null)).toMatchObject({ date: '2026-11-24', time: null });
    expect(await createManual(db(), userId, { title: 'Viva', date: '2026-11-23' }, at)).toMatchObject({ refused: 'PAST', fields: { date: 'This date has passed.' } });
  });
});

describe.skipIf(!hasDb)('edit and delete a Confirmed Event (FR-12)', () => {
  it('S06-4 AC-12.1 an edited time shows in the Events list and the order follows', async () => {
    const { agent } = await user();
    const first = await manual(agent, { title: 'Quiz', date: tomorrow, time: '09:00' });
    await manual(agent, { title: 'Lab', date: tomorrow, time: '11:00' });
    const res = await agent.patch(`/api/events/${first.id}`).send({ time: '13:00' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Quiz', time: '13:00' });
    expect((await agent.get('/api/events')).body.map((e: { title: string; time: string }) => [e.title, e.time])).toEqual([
      ['Lab', '11:00'],
      ['Quiz', '13:00'],
    ]);
    expect((await agent.get(`/api/events/${first.id}`)).body).toMatchObject({ time: '13:00' });
  });

  it('S06-4 edit changes only the details sent; none sent changes nothing', async () => {
    const { agent } = await user();
    const event = await manual(agent, { title: 'Quiz', date: tomorrow, time: '09:00', place: 'Room 4' });
    expect((await agent.patch(`/api/events/${event.id}`).send({})).body).toMatchObject({ title: 'Quiz', date: tomorrow, time: '09:00', place: 'Room 4' });
    expect((await agent.patch(`/api/events/${event.id}`).send({ date: inTwoDays, time: null })).body).toMatchObject({ title: 'Quiz', date: inTwoDays, time: null, place: 'Room 4' });
  });

  it('S06-5 AC-12.2 a deleted Event is gone; reading, editing or deleting it again answers 404', async () => {
    const { agent } = await user();
    const event = await manual(agent, { title: 'Quiz', date: tomorrow });
    expect((await agent.delete(`/api/events/${event.id}`)).status).toBe(204);
    expect((await agent.get('/api/events')).body).toEqual([]);
    expect((await agent.get(`/api/events/${event.id}`)).status).toBe(404);
    expect((await agent.patch(`/api/events/${event.id}`).send({ title: 'Again' })).status).toBe(404);
    expect((await agent.delete(`/api/events/${event.id}`)).status).toBe(404);
  });

  it('S06-6 BR-16 an edit that makes the Event past is refused and changes nothing; limits match review', async () => {
    const { agent } = await user();
    const event = await manual(agent, { title: 'Quiz', date: tomorrow, time: '09:00' });
    const past = await agent.patch(`/api/events/${event.id}`).send({ date: yesterday });
    expect(past.status).toBe(422);
    expect(past.body).toMatchObject({ error: 'PAST', fields: { date: 'This date has passed.' } });
    const bad = await agent.patch(`/api/events/${event.id}`).send({ title: '', place: 'p'.repeat(41), time: '9am' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['place', 'time', 'title']);
    expect((await agent.get(`/api/events/${event.id}`)).body).toMatchObject({ title: 'Quiz', date: tomorrow, time: '09:00' });
  });

  it('S06-7 editing keeps the Source Chat; a Manual Event stays Manual', async () => {
    const { agent } = await user();
    const chatEvent = await fromChat(agent);
    const edited = await agent.patch(`/api/events/${chatEvent.id}`).send({ title: 'Project meeting', time: '16:00' });
    expect(edited.body).toMatchObject({ title: 'Project meeting', time: '16:00', chat: chatEvent.chat });
    expect(edited.body.chat).toMatchObject({ name: 'Manual Class', colour: 1 });
    const own = await manual(agent, { title: 'Gym', date: tomorrow });
    expect((await agent.patch(`/api/events/${own.id}`).send({ place: 'Sports complex' })).body.chat).toEqual({ id: null, name: null, colour: null });
  });

  it("S06-8 BR-11 two Users: another User's Event cannot be read, edited or deleted", async () => {
    const a = await user();
    const b = await user();
    const event = await manual(a.agent, { title: 'Quiz', date: tomorrow });
    expect((await b.agent.get(`/api/events/${event.id}`)).status).toBe(404);
    expect((await b.agent.patch(`/api/events/${event.id}`).send({ title: 'Mine' })).status).toBe(404);
    expect((await b.agent.delete(`/api/events/${event.id}`)).status).toBe(404);
    expect((await b.agent.get(`/api/events/${MISSING}`)).status).toBe(404);
    expect((await b.agent.get('/api/events/not-an-id')).status).toBe(404);
    expect((await a.agent.get(`/api/events/${event.id}`)).body).toMatchObject({ title: 'Quiz' });
    expect((await request(app).post('/api/events').send({ title: 'Quiz', date: tomorrow })).status).toBe(401);
  });
});
