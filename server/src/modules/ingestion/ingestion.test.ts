import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
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

  it('S05-3: refuses a file that is neither .txt nor .zip', () => {
    for (const name of ['WhatsApp Chat with SE-3D Class.pdf', 'WhatsApp Chat with SE-3D Class']) {
      expect(parseExport(sample('WhatsApp Chat with SE-3D Class.txt'), name)).toMatchObject({ code: 'NOT_AN_EXPORT' });
    }
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

describe('ingestion iPhone .zip (S05, AC-02.2, BR-03, BR-15)', () => {
  const REAL = join(__dirname, '../../../test/fixtures/exports/real');
  const real = () => new Uint8Array(readFileSync(join(REAL, 'WhatsApp Chat - Binary tree.zip')));
  const LRM = String.fromCharCode(0x200e);
  const zip = (entries: Record<string, Uint8Array | [Uint8Array, { level: 0 | 9 }]>) => zipSync(entries);

  /** Overwrites one entry's compressed bytes with 0xFF, which no inflater accepts (invalid block type). */
  function damage(bytes: Uint8Array, name: string): Uint8Array {
    const out = bytes.slice();
    const nameAt = Buffer.from(out).indexOf(Buffer.from(name)); // first hit is the local file header
    const view = new DataView(out.buffer);
    const size = view.getUint32(nameAt - 12, true);
    const extra = view.getUint16(nameAt - 2, true);
    out.fill(0xff, nameAt + name.length + extra, nameAt + name.length + extra + size);
    return out;
  }

  it('AC-02.2 N2: reads the 2 text messages from Zain in the sample .zip, after the 3-day Start Point', () => {
    const p = parsed(sample('WhatsApp Chat - ISE Project Team.zip'), 'WhatsApp Chat - ISE Project Team.zip');
    expect(p.nameFromFile).toBe('ISE Project Team');
    expect(p.dateOrder).toBe('DMY');
    const s = selectEligible(p.messages, { startPoint: pkt('2026-10-16T10:25'), readUpTo: null, boundary: {} });
    expect(s.eligible.map((m) => [m.sender, m.sentAt])).toEqual([
      ['Zain', pkt('2026-10-16T20:14')],
      ['Zain', pkt('2026-10-18T21:40')],
    ]);
  });

  it('S05-1 Q-13: never inflates a media entry, so a damaged photo does not stop the chat being read', () => {
    const chat = text(`[16/10/2026, 8:14:55${N}PM] Zain: demo slot is 23/10 at 11:30\n`);
    const photo = new Uint8Array(4096).map((_, i) => i % 251);
    const bytes = damage(zip({ '_chat.txt': chat, '00000012-PHOTO-2026-10-17.jpg': [photo, { level: 9 }] }), '00000012-PHOTO-2026-10-17.jpg');
    expect(parsed(bytes, 'WhatsApp Chat - Team.zip').messages).toHaveLength(1);
    // The same damage on _chat.txt itself is refused, which shows the damage is real.
    const broken = damage(zip({ '_chat.txt': [chat, { level: 9 }] }), '_chat.txt');
    expect(parseExport(broken, 'WhatsApp Chat - Team.zip')).toMatchObject({ code: 'NOT_AN_EXPORT', reason: expect.stringContaining('damaged') });
  });

  it('S05-2 R2-18: reads the real iPhone export: month/day found, notices, media and documents ignored, marks removed', () => {
    const p = parsed(real(), 'WhatsApp Chat - Binary tree.zip');
    expect(p.nameFromFile).toBe('Binary tree');
    expect(p.dateOrder).toBe('MDY');
    expect(p.messages).toHaveLength(299);
    expect(new Set(p.messages.map((m) => m.sender))).toEqual(new Set(['PersonA', 'PersonB', 'PersonC']));
    for (const m of p.messages) {
      expect(m.text).not.toMatch(/[\u200e\u2068\u2069]|omitted$|<attached:/);
    }
    const now = pkt('2026-11-23T20:00');
    const read = (days: number) =>
      selectEligible(p.messages, { startPoint: new Date(now.getTime() - days * 86_400_000), readUpTo: null, boundary: {} }).eligible;
    expect(read(7)).toHaveLength(37);
    expect(read(1)).toHaveLength(11);
    expect(read(1)[0].sentAt).toEqual(pkt('2026-11-23T19:02'));
  });

  it('S05-2 BR-03: iPhone line kinds: text read; notice, media, document and captioned media ignored', () => {
    const p = parsed(
      text(
        [
          `[13/10/2026, 9:00:01${N}AM] Team: ${LRM}Messages and calls are end-to-end encrypted.`,
          `[13/10/2026, 9:00:02${N}AM] Team: ${LRM}Zain added you`,
          `${LRM}[13/10/2026, 9:01:00${N}AM] Zain: ${LRM}image omitted`,
          `${LRM}[13/10/2026, 9:02:00${N}AM] Zain: notes.pdf ${LRM}document omitted`,
          `${LRM}[13/10/2026, 9:03:00${N}AM] Zain: meeting at 5 ${LRM}image omitted`,
          `[13/10/2026, 9:04:00${N}AM] ${LRM}You: ${LRM}You pinned a message`,
          `[13/10/2026, 9:05:00${N}AM] Zain: @\u2068Areeb\u2069 quiz kal hai`,
          `[13/10/2026, 21:06:00] Zain: ok`,
        ].join('\r\n'),
      ),
      'WhatsApp Chat - Team.txt',
    );
    expect(p.messages.map((m) => [m.text, m.sentAt])).toEqual([
      ['@Areeb quiz kal hai', pkt('2026-10-13T09:05')],
      ['ok', pkt('2026-10-13T21:06')],
    ]);
  });

  it('S05-3 BR-15: refuses a .zip without _chat.txt, a damaged .zip, and a _chat.txt over 20 MB; 20 MB exactly is read', () => {
    const line = `19/10/2026, 10:00${N}am - A: hi\n`;
    expect(parseExport(zip({ 'notes.txt': text(line) }), 'WhatsApp Chat - X.zip')).toMatchObject({ code: 'NOT_AN_EXPORT', reason: expect.stringContaining('no WhatsApp chat') });
    expect(parseExport(text('PK not really a zip'), 'WhatsApp Chat - X.zip')).toMatchObject({ code: 'NOT_AN_EXPORT', reason: expect.stringContaining('damaged') });
    const sized = (n: number) => text(line + 'x'.repeat(n - text(line).length));
    const limit = 20 * 1024 * 1024;
    expect(parseExport(zip({ '_chat.txt': [sized(limit + 1), { level: 9 }] }), 'WhatsApp Chat - X.zip')).toMatchObject({
      code: 'NOT_AN_EXPORT',
      reason: expect.stringContaining('too large'),
    });
    expect(parseExport(zip({ '_chat.txt': [sized(limit), { level: 9 }] }), 'WhatsApp Chat - X.zip')).toMatchObject({ kind: 'parsed' });
  });
});
