import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pktToUtc } from '../../shared/time';
import { parseExport, type Parsed } from './parse';
import { selectEligible } from './select';

const SAMPLES = join(__dirname, '../../../test/fixtures/exports/samples');
const sample = (name: string) => new Uint8Array(readFileSync(join(SAMPLES, name)));
const text = (s: string) => new TextEncoder().encode(s);
const N = ' ';

function parsed(bytes: Uint8Array, filename = 'WhatsApp Chat with Test.txt'): Parsed {
  const result = parseExport(bytes, filename);
  if (result.kind !== 'parsed') throw new Error(`expected parsed, got ${JSON.stringify(result)}`);
  return result;
}

const pkt = (iso: string) => {
  const [d, t] = iso.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return pktToUtc(y, mo, da, h, mi);
};

describe('ingestion.parseExport (BR-03, BR-15)', () => {
  it('AC-02.1 N1: reads SE-3D Class as text messages only, joining the three-line message', () => {
    const p = parsed(sample('WhatsApp Chat with SE-3D Class.txt'), 'WhatsApp Chat with SE-3D Class.txt');
    expect(p.nameFromFile).toBe('SE-3D Class');
    expect(p.fileKey).toBe('se-3d class');
    expect(p.dateOrder).toBe('DMY');
    // 13 message lines: the notice, "added", media and deleted lines are dropped.
    expect(p.messages.map((m) => m.text)).toEqual([
      'Welcome to SE-3D class group',
      'Quiz 2 was today, results next week',
      'Assignment 3 due 13/10 by midnight',
      'Sir ne kaha hai project proposal Friday tak submit karna hai',
      'anyone has the slides?',
      'Reminder:\nOOP lab moved to Wednesday 21/10 at 2pm\nRoom C-204',
      'kal class hai?',
      'Meeting tomorrow at 3pm in Room 4',
      'noted',
    ]);
    expect(p.messages[7].sentAt).toEqual(pkt('2026-10-19T10:25'));
    expect(p.messages[7].sender).toBe('CR Usman');
  });

  it('AC-02.1 N1: with Start Point 12 Oct 10:25 exactly 6 messages are read', () => {
    const p = parsed(sample('WhatsApp Chat with SE-3D Class.txt'));
    const s = selectEligible(p.messages, { startPoint: pkt('2026-10-12T10:25'), readUpTo: null, boundary: {} });
    expect(s.eligible).toHaveLength(6);
    expect(s.eligible[0].text).toMatch(/^Sir ne kaha/);
    expect(s.eligible.at(-1)?.text).toBe('noted');
    expect(s.readUpTo).toEqual(pkt('2026-10-19T10:25'));
    expect(Object.values(s.boundary)).toEqual([1, 1]); // the two 10:25 messages
  });

  it('AC-02.3 F2: refuses a renamed note and an unrelated text file', () => {
    for (const name of ['notes.txt', 'WhatsApp Chat with Fake.txt']) {
      expect(parseExport(sample(name), name)).toMatchObject({ kind: 'rejected', code: 'NOT_AN_EXPORT' });
    }
    expect(parseExport(text(''), 'WhatsApp Chat with Empty.txt')).toMatchObject({ code: 'NOT_AN_EXPORT' });
  });

  it('refuses anything that is not a .txt for now (iPhone .zip is S05)', () => {
    expect(parseExport(sample('WhatsApp Chat - ISE Project Team.zip'), 'WhatsApp Chat - ISE Project Team.zip')).toMatchObject({
      code: 'NOT_AN_EXPORT',
    });
  });

  it('B2: asks for the date order when every date fits both orders, and reads after the answer', () => {
    const bytes = sample('WhatsApp Chat with Society Core.txt');
    expect(parseExport(bytes, 'WhatsApp Chat with Society Core.txt')).toEqual({ kind: 'needs-date-order', nameFromFile: 'Society Core' });
    const dmy = parseExport(bytes, 'x.txt', 'DMY') as Parsed;
    expect(dmy.messages.map((m) => m.sentAt)).toEqual([pkt('2026-10-05T18:00'), pkt('2026-10-12T18:05')]);
  });

  it('works out month/day order from a date that fits only that order (real export style, two-digit year)', () => {
    const p = parsed(text(`10/25/26, 3:22${N}PM - Person A: Quiz kal hai\n11/2/26, 9:05${N}AM - Person B: ok`));
    expect(p.dateOrder).toBe('MDY');
    expect(p.messages.map((m) => m.sentAt)).toEqual([pkt('2026-10-25T15:22'), pkt('2026-11-02T09:05')]);
  });

  it('refuses a stored order that the file contradicts (R2-6)', () => {
    expect(parseExport(sample('WhatsApp Chat with SE-3D Class.txt'), 'x.txt', 'MDY')).toMatchObject({
      kind: 'rejected',
      code: 'DATE_ORDER_MISMATCH',
    });
  });

  it.each([
    ['12:05 am', '00:05'],
    ['12:05 pm', '12:05'],
    ['9:00 am', '09:00'],
    ['11:59 PM', '23:59'],
    ['21:00', '21:00'],
    ['0:00', '00:00'],
  ])('reads the clock time %s as %s', (clock, expected) => {
    const p = parsed(text(`20/10/2026, ${clock.replace(' ', N)} - A: hi`));
    expect(p.messages[0].sentAt).toEqual(pkt(`2026-10-20T${expected}`));
  });

  it('treats an impossible header as a continuation line', () => {
    const p = parsed(text(`20/10/2026, 9:00 am - A: first\n31/02/2026, 9:01 am - B: second\n20/10/2026, 13:00 pm - C: third`));
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0].text).toBe('first\n31/02/2026, 9:01 am - B: second\n20/10/2026, 13:00 pm - C: third');
  });

  it('ignores media, deleted and notice lines, strips the edited marker, BOM and CRLF', () => {
    const lines = [
      '﻿20/10/2026, 9:00 am - Messages and calls are end-to-end encrypted.',
      '20/10/2026, 9:01 am - A: <Media omitted>',
      '20/10/2026, 9:02 am - A: sticker omitted',
      '20/10/2026, 9:03 am - A: This message was deleted',
      '20/10/2026, 9:04 am - A: You deleted this message',
      '20/10/2026, 9:05 am - A: IMG-20261020-WA0001.jpg (file attached)',
      '20/10/2026, 9:06 am - A changed the group description',
      'a continuation of a notice is dropped too',
      '20/10/2026, 9:07 am - A: kal meeting hai <This message was edited>',
    ];
    const p = parsed(text(lines.join('\r\n')));
    expect(p.messages.map((m) => m.text)).toEqual(['kal meeting hai']);
  });

  it.each([
    ['WhatsApp Chat with SE-3D Class (1).txt', 'SE-3D Class', 'se-3d class'],
    ['WhatsApp Chat with Cricket 🏏 Team.txt', 'Cricket 🏏 Team', 'cricket 🏏 team'],
    ['chat export.txt', null, 'chat export'],
  ])('takes the Chat name from %s', (filename, name, key) => {
    const p = parsed(text('20/10/2026, 9:00 am - A: hi'), filename);
    expect([p.nameFromFile, p.fileKey]).toEqual([name, key]);
  });
});

describe('ingestion.selectEligible (BR-02)', () => {
  const msgs = parsed(text(['13/10/2026, 10:24 am - A: one minute before', '13/10/2026, 10:25 am - A: at the Start Point'].join('\n'))).messages;

  it('reads a message at the Start Point minute and skips one a minute before', () => {
    const s = selectEligible(msgs, { startPoint: pkt('2026-10-13T10:25'), readUpTo: null, boundary: {} });
    expect(s.eligible.map((m) => m.text)).toEqual(['at the Start Point']);
  });

  it('reads nothing and keeps no pointer when no message is after the Start Point', () => {
    expect(selectEligible(msgs, { startPoint: pkt('2026-11-01T00:00'), readUpTo: null, boundary: {} })).toEqual({
      eligible: [],
      readUpTo: null,
      boundary: {},
    });
  });

  it('AC-03.1 B1 (ingestion part): a newer export reads only the 3 messages not read before', () => {
    const first = parsed(sample('WhatsApp Chat with SE-3D Class.txt'));
    const done = selectEligible(first.messages, { startPoint: pkt('2026-10-12T10:25'), readUpTo: null, boundary: {} });
    const v2 = parsed(new Uint8Array(readFileSync(join(SAMPLES, 'v2', 'WhatsApp Chat with SE-3D Class.txt'))));
    const next = selectEligible(v2.messages, { startPoint: pkt('2026-10-12T10:25'), readUpTo: done.readUpTo, boundary: done.boundary });
    expect(next.eligible.map((m) => m.text)).toEqual([
      'kal 5 baje project meeting hai',
      'Lab report due Friday',
      'The meeting yesterday went well',
    ]);
    expect(next.readUpTo).toEqual(pkt('2026-10-21T19:31'));
  });

  it('reads a repeated identical message in the boundary minute once per copy', () => {
    const one = parsed(text('20/10/2026, 9:00 am - A: ok')).messages;
    const two = parsed(text('20/10/2026, 9:00 am - A: ok\n20/10/2026, 9:00 am - A: ok')).messages;
    const first = selectEligible(one, { startPoint: pkt('2026-10-20T00:00'), readUpTo: null, boundary: {} });
    const again = selectEligible(two, { startPoint: pkt('2026-10-20T00:00'), readUpTo: first.readUpTo, boundary: first.boundary });
    expect(again.eligible).toHaveLength(1);
    expect(Object.values(again.boundary)).toEqual([2]);
    expect(selectEligible(two, { startPoint: pkt('2026-10-20T00:00'), readUpTo: again.readUpTo, boundary: again.boundary }).eligible).toEqual([]);
  });
});
