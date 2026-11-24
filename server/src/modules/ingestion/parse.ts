// The only code that knows the WhatsApp export format (AGENTS.md section 4.5). Pure: no clock, I/O or logging.
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { pktToUtc } from '../../shared/time';

export type DateOrder = 'DMY' | 'MDY';

/** A text message that may be read. Notices, media and deleted lines are never returned (BR-03). */
export type Message = { sentAt: Date; sender: string; text: string; fingerprint: string };

export type Parsed = {
  kind: 'parsed';
  /** Chat name from the file name, as written; null when the file name is not WhatsApp's (R2-4). */
  nameFromFile: string | null;
  /** Normalised name (or file stem) compared on later uploads (R2-4). */
  fileKey: string;
  dateOrder: DateOrder;
  messages: Message[];
};
export type Rejected = { kind: 'rejected'; code: 'NOT_AN_EXPORT' | 'DATE_ORDER_MISMATCH'; reason: string };
export type NeedsDateOrder = { kind: 'needs-date-order'; nameFromFile: string | null };

// Android "19/10/2026, 10:25 am - Hira: noted"; iPhone "[10/25/26, 3:22:38 PM] Hira: noted" (seconds are dropped).
// Both put a narrow no-break space before am/pm (\s matches it); some phones use 24-hour time.
const HEADER = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2}),? (\d{1,2}):(\d{2})(?:\s?([ap])\.?\s?m\.?)? - (.*)$/i;
const IPHONE_HEADER = /^\[(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2}),? (\d{1,2}):(\d{2})(?::\d{2})?(?:\s?([ap])\.?\s?m\.?)?\] (.*)$/i;
const FILE_NAME = /^WhatsApp Chat (?:with|-) (.+)$/i;
const COPY_SUFFIX = / \(\d+\)$/; // "name (1).txt" when the phone saved the file twice
const EDITED = /\s*<This message was edited>$/;
const LRM = String.fromCharCode(0x200e); // left-to-right mark iPhone puts before notices, media and some lines
// Invisible marks removed from message text: the left-to-right mark and the isolate marks around an @mention.
const MARKS = new RegExp(`[${LRM}${String.fromCharCode(0x2068)}${String.fromCharCode(0x2069)}]`, 'g');
// iPhone media line, with or without a caption or file name in front ("notes.pdf <LRM>document omitted").
// Ignored whole, caption included (BR-03, S05 decision 2).
const MEDIA_SUFFIX = new RegExp(`${LRM}(image|video|audio|sticker|GIF|document|Contact card) omitted$`, 'i');
const CHAT_ENTRY = '_chat.txt';
const MAX_CHAT_BYTES = 20 * 1024 * 1024; // zip-bomb guard: a _chat.txt that would inflate past this is refused
const IGNORED_TEXT = [
  /^<Media omitted>$/i,
  /^(image|video|audio|sticker|GIF|document|Contact card) omitted$/i,
  /^<attached: .*>$/i,
  /\(file attached\)$/i,
  /^This message was deleted$/i,
  /^You deleted this message$/i,
  /^null$/,
];

const notAnExport = (reason: string): Rejected => ({ kind: 'rejected', code: 'NOT_AN_EXPORT', reason });

function names(filename: string) {
  const stem = filename.replace(/\.[^.]*$/, '').trim().replace(COPY_SUFFIX, '').trim();
  const name = FILE_NAME.exec(stem)?.[1].trim() || null;
  return { nameFromFile: name, fileKey: (name ?? stem).toLowerCase() };
}

type Header = { a: number; b: number; year: number; hour: number; minute: number; rest: string };

function readHeader(line: string): Header | undefined {
  const m = HEADER.exec(line) ?? IPHONE_HEADER.exec(line);
  if (!m) return undefined;
  const [, a, b, y, h, min, ampm, rest] = m;
  let hour = Number(h);
  if (ampm) {
    if (hour < 1 || hour > 12) return undefined;
    hour = (hour % 12) + (ampm.toLowerCase() === 'p' ? 12 : 0);
  } else if (hour > 23) return undefined;
  if (Number(min) > 59) return undefined;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return { a: Number(a), b: Number(b), year, hour, minute: Number(min), rest };
}

function validDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** The order the phone used, from dates that fit only one order; undefined when every date fits both. */
function orderFromDates(headers: Header[]): DateOrder | 'mixed' | undefined {
  const dmy = headers.some((h) => h.a > 12);
  const mdy = headers.some((h) => h.b > 12);
  if (dmy && mdy) return 'mixed';
  return dmy ? 'DMY' : mdy ? 'MDY' : undefined;
}

export function fingerprint(sentAt: Date, sender: string, text: string): string {
  return createHash('sha256').update(`${sentAt.toISOString()}\n${sender}\n${text}`).digest('hex');
}

/** The `_chat.txt` inside an iPhone `.zip`. No other entry is ever inflated (BR-03, Q-13). */
function chatFromZip(bytes: Uint8Array): Uint8Array | Rejected {
  let tooBig = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.name !== CHAT_ENTRY) return false;
        tooBig = file.originalSize > MAX_CHAT_BYTES;
        return !tooBig;
      },
    });
  } catch {
    return notAnExport('This .zip file is damaged. Export the Chat again from WhatsApp.');
  }
  if (tooBig) return notAnExport('The chat inside this .zip is too large to read.');
  return files[CHAT_ENTRY] ?? notAnExport('This .zip has no WhatsApp chat in it. Use Export chat in WhatsApp and choose Without media.');
}

/** BR-15: parse an Android `.txt` or iPhone `.zip` Chat Export. `dateOrder` is the User's answer, or the order stored at approval. */
export function parseExport(bytes: Uint8Array, filename: string, dateOrder?: DateOrder): Parsed | Rejected | NeedsDateOrder {
  let chat = bytes;
  if (/\.zip$/i.test(filename)) {
    const unzipped = chatFromZip(bytes);
    if (!(unzipped instanceof Uint8Array)) return unzipped;
    chat = unzipped;
  } else if (!/\.txt$/i.test(filename)) {
    return notAnExport('Upload the .txt or .zip file WhatsApp made with Export chat.');
  }
  const lines = new TextDecoder('utf-8').decode(chat).split(/\r?\n/); // TextDecoder drops a UTF-8 BOM
  const headers = new Map<number, Header>();
  lines.forEach((line, i) => {
    const h = readHeader(line.startsWith(LRM) ? line.slice(1) : line);
    if (h) headers.set(i, h);
  });
  if (headers.size === 0) return notAnExport('This is not a WhatsApp Chat Export: no message lines were found in it.');

  const { nameFromFile, fileKey } = names(filename);
  const found = orderFromDates([...headers.values()]);
  if (found === 'mixed') return notAnExport('The dates in this file do not follow one order.');
  if (found && dateOrder && found !== dateOrder) {
    return { kind: 'rejected', code: 'DATE_ORDER_MISMATCH', reason: 'The dates in this file use a different order from this Chat.' };
  }
  const order = found ?? dateOrder;
  if (!order) return { kind: 'needs-date-order', nameFromFile };

  const messages: Message[] = [];
  let current: { sentAt: Date; sender: string; lines: string[] } | undefined; // undefined after a notice
  const finish = () => {
    if (!current) return;
    const raw = current.lines.join('\n');
    // iPhone starts notices (sent as the group, or "You") and media with a left-to-right mark (BR-03).
    const ignored = raw.startsWith(LRM) || MEDIA_SUFFIX.test(raw);
    const text = raw.replace(MARKS, '').replace(EDITED, '').trim();
    if (text && !ignored && !IGNORED_TEXT.some((re) => re.test(text))) {
      messages.push({ sentAt: current.sentAt, sender: current.sender, text, fingerprint: fingerprint(current.sentAt, current.sender, text) });
    }
    current = undefined;
  };

  lines.forEach((line, i) => {
    const h = headers.get(i);
    const [day, month] = h ? (order === 'DMY' ? [h.a, h.b] : [h.b, h.a]) : [0, 0];
    if (!h || !validDate(h.year, month, day)) {
      current?.lines.push(line); // a continuation line of a multi-line message
      return;
    }
    finish();
    const colon = h.rest.indexOf(': ');
    if (colon <= 0) return; // a WhatsApp notice such as "X added Y" has no sender (BR-03)
    current = { sentAt: pktToUtc(h.year, month, day, h.hour, h.minute), sender: h.rest.slice(0, colon), lines: [h.rest.slice(colon + 2)] };
  });
  finish();

  return { kind: 'parsed', nameFromFile, fileKey, dateOrder: order, messages };
}
