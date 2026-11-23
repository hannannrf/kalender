import { describe, expect, it } from 'vitest';
import { pktToUtc } from '../../shared/time';
import { detect } from './detect';

const MONDAY = pktToUtc(2026, 10, 19, 10, 0); // Monday 19 Oct 2026 10:00 PKT
const one = (text: string, at = MONDAY) => {
  const drafts = detect(text, at);
  expect(drafts, text).toHaveLength(1);
  return drafts[0];
};

describe('detection: acceptance criteria (FR-05)', () => {
  it('AC-05.1 English: date, time, place, no Uncertain marks', () => {
    expect(one('Meeting tomorrow at 3pm in Room 4')).toMatchObject({ title: 'Meeting', date: '2026-10-20', time: '15:00', place: 'Room 4', uncertain: [] });
  });

  it('AC-05.2 Roman Urdu with shaam: 17:00, no Uncertain marks', () => {
    expect(one('kal shaam 5 baje project meeting hai')).toMatchObject({ title: 'Project meeting', date: '2026-10-20', time: '17:00', uncertain: [] });
  });

  it('AC-05.3 bare hour: 17:00 with the time Uncertain (U1)', () => {
    const d = one('kal 5 baje project meeting hai');
    expect(d).toMatchObject({ date: '2026-10-20', time: '17:00', uncertain: ['time'] });
    expect(d.rules).toContain('U1');
  });

  it('AC-05.4 a Non-Event message gives nothing', () => {
    expect(detect('anyone has the slides?', MONDAY)).toEqual([]);
  });

  it('AC-05.5 Urdu script gives nothing', () => {
    expect(detect('کل میٹنگ ہے meeting', MONDAY)).toEqual([]);
  });

  it('AC-05.6 a period only gives "Needs date"', () => {
    expect(one('agle hafte presentation hai')).toMatchObject({ title: 'Presentation', date: null, time: null });
  });

  it('AC-05.7 past references give nothing', () => {
    expect(detect('The meeting yesterday went well', MONDAY)).toEqual([]);
    expect(detect('kal ki class bohat boring thi', MONDAY)).toEqual([]);
  });

  it('AC-05.9 a day name with no time is All-day', () => {
    expect(one('Lab report due Friday')).toMatchObject({ title: 'Lab report due', date: '2026-10-23', time: null, uncertain: [] });
  });

  it('AC-05.12 the sent weekday means 7 days later (U5)', () => {
    expect(one('Monday ko paper hai')).toMatchObject({ date: '2026-10-26', uncertain: ['date'], rules: expect.arrayContaining(['U5']) });
  });

  it('AC-05.13 a day name that conflicts with the date keeps the date (U6)', () => {
    expect(one('meeting Friday 24/10 at 3pm')).toMatchObject({ date: '2026-10-24', time: '15:00', uncertain: ['date'], rules: expect.arrayContaining(['U6']) });
  });
});

describe('detection: rules outside the Detection Test Set', () => {
  it('BR-17 gives one draft per Event line', () => {
    const drafts = detect('Reminders:\nQuiz on Thursday 9am\nLab report due Friday', MONDAY);
    expect(drafts.map((d) => [d.title, d.date, d.time])).toEqual([
      ['Quiz', '2026-10-22', '09:00'],
      ['Lab report due', '2026-10-23', null],
    ]);
  });

  it('reads a multi-line message with its place on another line as one Event', () => {
    expect(one('Reminder:\nOOP lab moved to Wednesday 21/10 at 2pm\nRoom C-204', pktToUtc(2026, 10, 18, 22, 12))).toMatchObject({
      title: 'OOP lab',
      date: '2026-10-21',
      time: '14:00',
      place: 'Room C-204',
      uncertain: [],
    });
  });

  it('drops an Event that is already past at the sent time', () => {
    expect(detect('class today at 9am', MONDAY)).toEqual([]);
    expect(one('class today at 11am')).toMatchObject({ date: '2026-10-19', time: '11:00' });
  });

  it('treats a question as a Non-Event', () => {
    expect(detect('kal class hai?', MONDAY)).toEqual([]);
  });

  it('rolls a date without a year that has passed to next year', () => {
    expect(one('exam on 5 Jan')).toMatchObject({ date: '2027-01-05' });
  });

  it.each([
    ['paune 5 baje shaam meeting', '16:45'],
    ['dedh baje dopehar lab', '13:30'],
    ['kal raat 10 baje call hai', '22:00'],
    ['practice tomorrow 7:30', '19:30'],
    ['quiz tomorrow 9:15', '09:15'],
    ['viva tomorrow 13:45', '13:45'],
  ])('reads the clock in "%s" as %s', (text, time) => {
    expect(one(text).time).toBe(time);
  });

  it('marks the time Uncertain for 1:00-7:59 without am, pm or a part of day', () => {
    expect(one('practice tomorrow 7:30').uncertain).toEqual(['time']);
  });

  it('U2: raat 12 baje is 00:00 on the next date', () => {
    expect(one('kal raat 12 baje submission')).toMatchObject({ date: '2026-10-21', time: '00:00', uncertain: ['date', 'time'] });
  });

  it('U4: agle jumma is Friday of the following week', () => {
    expect(one('agle jumma dawat hai')).toMatchObject({ date: '2026-10-30', uncertain: ['date'] });
  });

  it('U9: "if" marks the Event Uncertain', () => {
    expect(one('if it rains, match on Saturday').uncertain).toEqual(['event']);
  });

  it.each(['Quiz 2 was really hard', 'thanks for the dinner yesterday', 'assignment submit ho gaya', 'meeting kesi rahi?', 'ok', 'happy birthday!'])(
    'finds no Event in "%s"',
    (text) => {
      expect(detect(text, MONDAY)).toEqual([]);
    },
  );

  it('never uses the message as the title, and keeps titles and places short', () => {
    const text = 'Society general body meeting today at 5:00 PM, Auditorium';
    const d = one(text);
    expect(d.title).toBe('General body meeting');
    expect(d.title).not.toBe(text);
    expect(d.place).toBe('Auditorium');
    const long = one(`${'very '.repeat(30)}important meeting tomorrow at ${'The Grand '.repeat(10)}Hall`);
    expect(long.title.length).toBeLessThanOrEqual(60);
    expect((long.place ?? '').length).toBeLessThanOrEqual(40);
  });

  it('names a deadline with no words before it from the thing handed in', () => {
    expect(one('assignment 28/10 tak jama karwani hai').title).toBe('Assignment submission');
    expect(one('Final report is due 5 Nov').title).toBe('Final report due');
  });
});
