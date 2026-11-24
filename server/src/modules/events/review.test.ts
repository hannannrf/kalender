// S04: review, confirm, dismiss and the upcoming list (FR-06, FR-11, BR-05, BR-16, BR-21).
// Uploads are written relative to the real clock, because the routes use the current time.
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { eventStart, pktParts } from '../../shared/time';
import { hasDb, uniqueEmail } from '../../../test/db';
import { confirm, listUpcoming } from './service';

afterAll(closePool);

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SENT = new Date(Date.now() - 30 * MIN);

/** One Android export line sent at SENT, in the 12-hour PKT format. */
function line(sender: string, text: string) {
  const { date, time } = pktParts(SENT);
  const [y, m, d] = date.split('-');
  const [h, min] = time.split(':').map(Number);
  return `${d}/${m}/${y}, ${h % 12 || 12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} - ${sender}: ${text}`;
}

const MESSAGES = [
  line('Usman', 'Meeting tomorrow at 3pm in Room 4'),
  line('Hira', 'kal 5 baje project meeting hai'),
  line('Hira', 'parson 4 baje viva hai'),
  line('Bilal', 'agle hafte presentation hai'),
  line('Usman', 'Reminders:\nQuiz tomorrow 9am\nLab report due tomorrow'),
  line('Bilal', 'anyone has the slides?'),
];

type Detected = { id: string; title: string; date: string | null; time: string | null; uncertain: string[] };

/** A new User with one Approved Chat holding the MESSAGES above. */
async function setup() {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ email: uniqueEmail('review'), password: 'kal-5-baje-meeting' });
  const me = await agent.get('/api/me');
  const userId = (await db().query<{ id: string }>('select id from users where email = $1', [me.body.email])).rows[0].id;
  const file = Buffer.from(MESSAGES.join('\n') + '\n');
  const approved = await agent.post('/api/chats').field('name', 'Review Class').field('dateOrder', 'DMY').attach('file', file, 'WhatsApp Chat with Review Class.txt');
  expect(approved.status).toBe(201);
  const list: Detected[] = (await agent.get('/api/detected-events')).body;
  const byTitle = (title: string) => {
    const found = list.find((e) => e.title === title);
    if (!found) throw new Error(`no Detected Event "${title}" in ${JSON.stringify(list.map((e) => e.title))}`);
    return found;
  };
  const messageCount = async () => Number((await db().query('select count(*) from source_messages where user_id = $1', [userId])).rows[0].count);
  return { agent, userId, list, byTitle, messageCount };
}

const tomorrow = pktParts(new Date(SENT.getTime() + DAY)).date;
const inTwoDays = pktParts(new Date(SENT.getTime() + 2 * DAY)).date;

describe.skipIf(!hasDb)('review and confirm (FR-06, FR-11)', () => {
  it('reads the upload as expected (test precondition)', async () => {
    const { list, messageCount } = await setup();
    expect(list.map((e) => [e.title, e.date, e.time, e.uncertain])).toEqual(
      expect.arrayContaining([
        ['Meeting', tomorrow, '15:00', []],
        ['Project meeting', tomorrow, '17:00', ['time']],
        ['Viva', inTwoDays, '16:00', ['time']],
        ['Presentation', null, null, []],
        ['Quiz', tomorrow, '09:00', []],
        ['Lab report due', tomorrow, null, []],
      ]),
    );
    expect(list).toHaveLength(6);
    expect(await messageCount()).toBe(5); // "anyone has the slides?" is not stored (AC-05.4)
  });

  it('S04-1 AC-06.1 confirms in one action, leaves the list, deletes the Source Message text', async () => {
    const { agent, byTitle, messageCount } = await setup();
    const res = await agent.post(`/api/detected-events/${byTitle('Meeting').id}/confirm`);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Meeting', date: tomorrow, time: '15:00', place: 'Room 4', chat: { name: 'Review Class', colour: 1 } });
    expect((await agent.get('/api/detected-events')).body.map((e: Detected) => e.title)).not.toContain('Meeting');
    expect(await messageCount()).toBe(4);
    expect((await agent.get('/api/events')).body).toMatchObject([{ id: res.body.id, title: 'Meeting' }]);
  });

  it('S04-2 AC-06.2 an edited time is the confirmed time', async () => {
    const { agent, byTitle } = await setup();
    const id = byTitle('Meeting').id;
    expect((await agent.post(`/api/detected-events/${id}/review`).send({ time: '18:30' })).status).toBe(200);
    expect((await agent.post(`/api/detected-events/${id}/confirm`)).body).toMatchObject({ time: '18:30' });
  });

  it('S04-3 AC-06.3 dismiss removes the Event and its Source Message, and confirms nothing', async () => {
    const { agent, byTitle, messageCount } = await setup();
    const id = byTitle('Meeting').id;
    expect((await agent.post(`/api/detected-events/${id}/dismiss`)).status).toBe(204);
    expect((await agent.get(`/api/detected-events/${id}`)).status).toBe(404);
    expect((await agent.get('/api/events')).body).toEqual([]);
    expect(await messageCount()).toBe(4);
  });

  it('S04-4 AC-06.5 a date edited to 18 Oct 2026 cannot be confirmed; a time already passed neither (BR-16)', async () => {
    const { agent, userId, byTitle } = await setup();
    const meeting = byTitle('Meeting');
    const atStart = eventStart(tomorrow, '15:00');
    expect(await confirm(db(), userId, meeting.id, new Date(atStart.getTime() + MIN))).toMatchObject({ refused: 'PAST', fields: { time: expect.any(String) } });

    await agent.post(`/api/detected-events/${meeting.id}/review`).send({ date: '2026-10-18' });
    const res = await agent.post(`/api/detected-events/${meeting.id}/confirm`);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: 'PAST', fields: { date: expect.any(String) } });
    expect((await agent.get('/api/events')).body).toEqual([]);
  });

  it('S04-4 boundary: an Event starting this minute, or All-day today, can still be confirmed', async () => {
    const { userId, byTitle } = await setup();
    expect(await confirm(db(), userId, byTitle('Quiz').id, eventStart(tomorrow, '09:00'))).toMatchObject({ time: '09:00' });
    expect(await confirm(db(), userId, byTitle('Lab report due').id, eventStart(tomorrow, '23:59'))).toMatchObject({ time: null });
  });

  it('S04-5 AC-06.7 an unreviewed Uncertain time refuses confirm and names the time', async () => {
    const { agent, byTitle } = await setup();
    const res = await agent.post(`/api/detected-events/${byTitle('Project meeting').id}/confirm`);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('NEEDS_REVIEW');
    expect(Object.keys(res.body.fields)).toEqual(['time']);
  });

  it('S04-6 AC-06.8 accepting 17:00 or changing to 05:00 clears the mark, then confirm works in one action', async () => {
    const { agent, byTitle } = await setup();
    const kept = byTitle('Project meeting').id;
    expect((await agent.post(`/api/detected-events/${kept}/review`).send({ accept: ['time'] })).body).toMatchObject({ time: '17:00', uncertain: [] });
    expect((await agent.post(`/api/detected-events/${kept}/confirm`)).body).toMatchObject({ time: '17:00' });

    const changed = byTitle('Viva').id;
    expect((await agent.post(`/api/detected-events/${changed}/review`).send({ time: '05:00' })).body).toMatchObject({ time: '05:00', uncertain: [] });
    expect((await agent.post(`/api/detected-events/${changed}/confirm`)).body).toMatchObject({ date: inTwoDays, time: '05:00' });
  });

  it('S04-7 BR-05 BR-17 a Source Message stays until its last Detected Event is resolved', async () => {
    const { agent, userId, byTitle } = await setup();
    const hasReminders = async () =>
      (await db().query("select 1 from source_messages where user_id = $1 and text like 'Reminders:%'", [userId])).rowCount === 1;
    await agent.post(`/api/detected-events/${byTitle('Quiz').id}/confirm`);
    expect(await hasReminders()).toBe(true);
    await agent.post(`/api/detected-events/${byTitle('Lab report due').id}/dismiss`);
    expect(await hasReminders()).toBe(false);
  });

  it('S04-8 a Needs date Event confirms only after a date is entered', async () => {
    const { agent, byTitle } = await setup();
    const id = byTitle('Presentation').id;
    const refused = await agent.post(`/api/detected-events/${id}/confirm`);
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: 'NEEDS_DATE', fields: { date: expect.any(String) } });
    await agent.post(`/api/detected-events/${id}/review`).send({ date: inTwoDays });
    expect((await agent.post(`/api/detected-events/${id}/confirm`)).body).toMatchObject({ title: 'Presentation', date: inTwoDays, time: null });
  });

  it('S04-9 BR-16 refuses invalid details with the field named', async () => {
    const { agent, byTitle } = await setup();
    const url = `/api/detected-events/${byTitle('Meeting').id}/review`;
    const field = async (body: object) => {
      const res = await agent.post(url).send(body);
      return res.status === 400 ? Object.keys(res.body.fields) : res.status;
    };
    expect(await field({ title: '   ' })).toEqual(['title']);
    expect(await field({ title: 'x'.repeat(61) })).toEqual(['title']);
    expect(await field({ title: 'x'.repeat(60) })).toBe(200);
    expect(await field({ place: 'p'.repeat(41) })).toEqual(['place']);
    expect(await field({ place: 'p'.repeat(40) })).toBe(200);
    expect(await field({ date: '2026-02-30' })).toEqual(['date']);
    expect(await field({ date: 'tomorrow' })).toEqual(['date']);
    expect(await field({ time: '24:00' })).toEqual(['time']);
    expect(await field({ time: '23:59' })).toBe(200);
    expect(await field({ time: null })).toBe(200);
    expect(await field({ accept: ['colour'] })).toEqual(['accept']);
    expect((await agent.get(`/api/detected-events/${byTitle('Meeting').id}`)).body).toMatchObject({ title: 'x'.repeat(60), place: 'p'.repeat(40), time: null });
  });

  it('S04-10 AC-11.1 lists Upcoming Confirmed Events in date-and-time order with their Source Chat', async () => {
    const { agent, byTitle } = await setup();
    for (const title of ['Meeting', 'Quiz', 'Lab report due']) await agent.post(`/api/detected-events/${byTitle(title).id}/confirm`);
    const res = await agent.get('/api/events');
    expect(res.body.map((e: { title: string; time: string | null; chat: { name: string } }) => [e.title, e.time, e.chat.name])).toEqual([
      ['Lab report due', null, 'Review Class'],
      ['Quiz', '09:00', 'Review Class'],
      ['Meeting', '15:00', 'Review Class'],
    ]);
  });

  it('S04-11 AC-11.2 hides an Event once its start time has passed; All-day stays through its date', async () => {
    const { agent, userId, byTitle } = await setup();
    for (const title of ['Meeting', 'Quiz', 'Lab report due']) await agent.post(`/api/detected-events/${byTitle(title).id}/confirm`);
    const titlesAt = async (now: Date) => (await listUpcoming(db(), userId, now)).map((e) => e.title);
    expect(await titlesAt(eventStart(tomorrow, '15:00'))).toEqual(['Lab report due', 'Meeting']);
    expect(await titlesAt(eventStart(tomorrow, '15:01'))).toEqual(['Lab report due']);
    expect(await titlesAt(eventStart(inTwoDays, '00:00'))).toEqual([]);
  });

  it('S04-12 BR-11 another User cannot read, review, confirm or dismiss, and sees no Events', async () => {
    const owner = await setup();
    const id = owner.byTitle('Meeting').id;
    await owner.agent.post(`/api/detected-events/${owner.byTitle('Quiz').id}/confirm`);
    const other = await setup();
    expect((await other.agent.get(`/api/detected-events/${id}`)).status).toBe(404);
    expect((await other.agent.post(`/api/detected-events/${id}/review`).send({ title: 'Mine' })).status).toBe(404);
    expect((await other.agent.post(`/api/detected-events/${id}/confirm`)).status).toBe(404);
    expect((await other.agent.post(`/api/detected-events/${id}/dismiss`)).status).toBe(404);
    expect((await other.agent.get('/api/events')).body).toEqual([]);
    expect((await other.agent.get('/api/detected-events/not-an-id')).status).toBe(404);
    expect((await owner.agent.get(`/api/detected-events/${id}`)).body).toMatchObject({ title: 'Meeting', message: { sender: 'Usman' } });
  });

  it('needs a session', async () => {
    expect((await request(app).get('/api/events')).status).toBe(401);
    expect((await request(app).post('/api/detected-events/00000000-0000-0000-0000-000000000000/confirm')).status).toBe(401);
  });
});
