// Rule-based Event detection (ADR-004). Pure: the sent time is a parameter; no clock, I/O, environment or logging.
import { PKT_OFFSET_MS } from '../../shared/time';
import * as V from './vocabulary';

export type Mark = 'date' | 'time' | 'event';

export type DetectedEventDraft = {
  /** Built from activity words, at most 60 characters; never the message itself. */
  title: string;
  /** PKT calendar date YYYY-MM-DD; null means "Needs date". */
  date: string | null;
  /** PKT clock time HH:MM; null means All-day. */
  time: string | null;
  /** From an explicit location phrase only, at most 40 characters. */
  place: string | null;
  uncertain: Mark[];
  /** Rule ids that fired, for explanations and tests (BR-12, BR-21 U1 to U9). */
  rules: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const URDU_SCRIPT = new RegExp(`[${String.fromCharCode(0x600)}-${String.fromCharCode(0x6ff)}]`);

const words = (list: readonly string[]) => list.map((w) => w.replace(/ /g, '\\s+')).join('|');
const anyOf = (list: readonly string[]) => new RegExp(`\\b(?:${words(list)})\\b`);
const ACTIVITY_RE = new RegExp(`\\b(${words(V.ACTIVITY)})\\b`);
const PAST_RE = anyOf(V.PAST);
const TENTATIVE_RE = anyOf(V.TENTATIVE);
const PERIOD_RE = anyOf(V.PERIOD);
const VAGUE_RE = anyOf(V.VAGUE_TIME);
const MONTH = `(${Object.keys(V.MONTHS).sort((a, b) => b.length - a.length).join('|')})`;
const DAY = `(${Object.keys(V.DAYS).join('|')})`;
const ORD = '(?:st|nd|rd|th)?';

// ---------- calendar helpers (a "day" is the UTC midnight of a PKT calendar date) ----------

const dayOf = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const isoDay = (day: number) => new Date(day).toISOString().slice(0, 10);
const weekday = (day: number) => new Date(day).getUTCDay();
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(dayOf(y, m, d));
  return m >= 1 && m <= 12 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** BR-12: a date without a year is its next occurrence on or after the sent date. */
function nextOccurrence(today: number, m: number, d: number): number | undefined {
  const y = new Date(today).getUTCFullYear();
  for (const year of [y, y + 1]) if (validDay(year, m, d) && dayOf(year, m, d) >= today) return dayOf(year, m, d);
  return undefined;
}

// ---------- dates ----------

type DateFound = { day: number; rule: string; uncertain?: 'U3' | 'U4' | 'U5' | 'U6' | 'U7'; explicit?: boolean };

function explicitDate(s: string, today: number): DateFound | undefined {
  // U7: alternatives such as "22 ya 23 Oct" use the first one.
  let m = new RegExp(`\\b(\\d{1,2})${ORD}\\s*(?:or|ya|/|-|&|and)\\s*\\d{1,2}${ORD}\\s+(?:of\\s+)?${MONTH}\\b`).exec(s);
  if (m) {
    const day = nextOccurrence(today, V.MONTHS[m[2]], Number(m[1]));
    if (day !== undefined) return { day, rule: 'U7', uncertain: 'U7', explicit: true };
  }
  m = new RegExp(`\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH}\\b`).exec(s);
  if (m) {
    const day = nextOccurrence(today, V.MONTHS[m[2]], Number(m[1]));
    if (day !== undefined) return { day, rule: 'month-name', explicit: true };
  }
  m = new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})${ORD}\\b(?!\\s*(?::|baje|am|pm))`).exec(s);
  if (m) {
    const day = nextOccurrence(today, V.MONTHS[m[1]], Number(m[2]));
    if (day !== undefined) return { day, rule: 'month-name', explicit: true };
  }
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/.exec(s);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    let day: number | undefined;
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      day = validDay(y, mo, d) ? dayOf(y, mo, d) : undefined;
    } else day = nextOccurrence(today, mo, d);
    // U3: both parts 12 or less could also be month/day; day/month is used and the date is Uncertain.
    if (day !== undefined) return d <= 12 && mo <= 12 ? { day, rule: 'U3', uncertain: 'U3', explicit: true } : { day, rule: 'numeric-date', explicit: true };
  }
  return undefined;
}

function relativeDate(s: string, today: number): DateFound | undefined {
  if (/\b(?:day after tomorrow|parson|parso|parsoon)\b/.test(s)) return { day: today + 2 * DAY_MS, rule: 'parson' };
  if (/\b(?:tomorrow|tmrw|kal)\b/.test(s)) return { day: today + DAY_MS, rule: 'kal' };
  if (/\b(?:today|tonight|aaj)\b/.test(s)) return { day: today, rule: 'aaj' };
  return undefined;
}

function dayName(s: string, today: number): { found: DateFound; target: number } | undefined {
  const m = new RegExp(`\\b(?:(next|agle|agla|agli|this)\\s+)?${DAY}(?:'s)?\\b`).exec(s);
  if (!m) return undefined;
  const target = V.DAYS[m[2]];
  const sent = weekday(today);
  if (m[1] && m[1] !== 'this') {
    // U4: "next Friday" is that day in the following Monday-to-Sunday week.
    const monday = today - ((sent + 6) % 7) * DAY_MS;
    return { found: { day: monday + 7 * DAY_MS + ((target + 6) % 7) * DAY_MS, rule: 'U4', uncertain: 'U4' }, target };
  }
  const ahead = (target - sent + 7) % 7;
  // U5: the sent date's own weekday means 7 days later.
  if (ahead === 0) return { found: { day: today + 7 * DAY_MS, rule: 'U5', uncertain: 'U5' }, target };
  return { found: { day: today + ahead * DAY_MS, rule: 'day-name' }, target };
}

function findDate(s: string, today: number): DateFound | undefined {
  const named = dayName(s, today);
  const explicit = explicitDate(s, today);
  if (explicit) {
    // U6: a day name that does not match the explicit date; the explicit date is used.
    if (named && weekday(explicit.day) !== named.target) return { ...explicit, rule: 'U6', uncertain: explicit.uncertain ?? 'U6' };
    return explicit;
  }
  return relativeDate(s, today) ?? named?.found;
}

// ---------- times ----------

type TimeFound = { minutes: number; rule: string; uncertain?: 'U1' | 'U2'; nextDay?: boolean } | { vague: true };

function partOfDay(s: string): (typeof V.PART_OF_DAY)[string] | undefined {
  const m = new RegExp(`\\b(${Object.keys(V.PART_OF_DAY).join('|')})\\b`).exec(s);
  return m ? V.PART_OF_DAY[m[1]] : undefined;
}

/** A bare hour with a part-of-day word, or U1 without one. */
function readHour(h: number, min: number, part: ReturnType<typeof partOfDay>, rule: string): TimeFound | undefined {
  if (h < 0 || h > 23 || min > 59) return undefined;
  if (h > 12) return { minutes: h * 60 + min, rule };
  if (part === 'am') return { minutes: (h % 12) * 60 + min, rule };
  if (part === 'noon') return { minutes: (h === 12 || h >= 8 ? h : h + 12) * 60 + min, rule };
  if (part === 'pm') return { minutes: (h === 12 ? 12 : h + 12) * 60 + min, rule };
  if (part === 'night') {
    // U2: "raat 12 baje" (and the small hours) is the following date; date and time are Uncertain.
    if (h === 12 || h <= 4) return { minutes: (h % 12) * 60 + min, rule: 'U2', uncertain: 'U2', nextDay: true };
    return { minutes: (h + 12) * 60 + min, rule };
  }
  // U1: 1-7 = PM, 8-11 = AM, 12 = noon.
  const hour = h >= 1 && h <= 7 ? h + 12 : h;
  return { minutes: hour * 60 + min, rule: 'U1', uncertain: 'U1' };
}

const FRACTION: Record<string, number> = { sawa: 15, sava: 15, sadhe: 30, saadhe: 30, sarhe: 30, paune: -15, pone: -15 };

function findTime(s: string): TimeFound | undefined {
  const part = partOfDay(s);
  let m = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b/.exec(s);
  if (m) {
    const [h, min] = [Number(m[1]), Number(m[2] ?? 0)];
    if (h >= 1 && h <= 12 && min <= 59) return { minutes: ((h % 12) + (m[3] === 'p' ? 12 : 0)) * 60 + min, rule: 'am-pm' };
  }
  m = /\b(dedh|derh|dhai|dhaai|adhai)\s*(?:baje|bajay|bje)\b/.exec(s);
  if (m) return readHour(m[1] === 'dedh' || m[1] === 'derh' ? 1 : 2, 30, part, 'baje'); // dedh 1:30, dhai 2:30
  m = /\b(?:(sawa|sava|sadhe|saadhe|sarhe|paune|pone)\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:baje|bajay|bje)\b/.exec(s);
  if (m) {
    const total = Number(m[2]) * 60 + Number(m[3] ?? 0) + (m[1] ? FRACTION[m[1]] : 0);
    return readHour(Math.floor(total / 60), total % 60, part, 'baje');
  }
  m = /\b(\d{1,2}):(\d{2})\b/.exec(s);
  if (m) {
    const [h, min] = [Number(m[1]), Number(m[2])];
    // 24-hour clock as written ("15:00", "11:30"). With a part of day it follows that; 1:00-7:59 alone is a bare hour (U1).
    if (h === 0 || h > 12) return { minutes: h * 60 + min, rule: '24-hour' };
    if (part || h < 8) return readHour(h, min, part, '24-hour');
    return { minutes: h * 60 + min, rule: '24-hour' };
  }
  m = new RegExp(`\\b(\\d{1,2})\\s*-\\s*(\\d{1,2})\\b(?!\\s*(?:/|${MONTH}))`).exec(s) ?? /\bat\s+(\d{1,2})\b(?![:/.]\d)/.exec(s) ?? /\b(\d{1,2})\s*o'?clock\b/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return readHour(Number(m[1]), 0, part, 'range-start');
  if (part || VAGUE_RE.test(s)) return { vague: true };
  return undefined;
}

// ---------- title and place ----------

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const clean = (token: string) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function buildTitle(original: string, lower: string): string {
  const matches = [...lower.matchAll(new RegExp(ACTIVITY_RE.source, 'g'))];
  const chosen = matches.find((m) => V.DEADLINE.includes(m[1])) ?? matches[0];
  const word = original.slice(chosen.index, chosen.index + chosen[1].length);
  const before = original.slice(0, chosen.index).split(/\s+/).map(clean).filter(Boolean);
  const kept: string[] = [];
  for (let i = before.length - 1; i >= 0 && kept.length < 2; i--) {
    const t = before[i];
    const lowerT = t.toLowerCase();
    if (kept.length === 0 && V.COPULA.has(lowerT)) continue;
    if (V.TITLE_STOP.has(lowerT) || V.MONTHS[lowerT] || lowerT in V.DAYS || lowerT in V.PART_OF_DAY || /[/:]/.test(t)) break;
    if (/^\d+$/.test(t) && i > 0 && !/^[a-z]/i.test(before[i - 1])) break; // a number that is not "Assignment 4"
    kept.unshift(t);
  }
  let title = [...kept, word].join(' ');
  if (!kept.length && V.DEADLINE.includes(chosen[1])) {
    const thing = V.DELIVERABLE.find((d) => new RegExp(`\\b${d}\\b`).test(lower));
    if (thing) title = `${thing} ${chosen[1] === 'deadline' || chosen[1] === 'due' ? chosen[1] : 'submission'}`;
  }
  return capitalise(title).slice(0, 60);
}

function findPlace(original: string, lower: string): string | null {
  let m = /\broom\s+([a-z]{0,2}-?\d{1,4}[a-z]?)\b/i.exec(original);
  if (m) return `Room ${m[1].toUpperCase()}`;
  m = new RegExp(`\\bon\\s+(${Object.keys(V.ONLINE_PLACES).join('|')})\\b`).exec(lower);
  if (m) return V.ONLINE_PLACES[m[1]];
  m = /\bat\s+([A-Z][\p{L}-]*(?:\s+[A-Z][\p{L}-]*)?)/u.exec(original);
  if (m && !m[1].split(/\s+/).some((w) => V.MONTHS[w.toLowerCase()] || w.toLowerCase() in V.DAYS)) return m[1].slice(0, 40);
  m = new RegExp(`\\b(${V.PLACE_NOUNS.join('|')})\\b`).exec(lower);
  if (m) return capitalise(m[1]);
  return null;
}

// ---------- one Event mention ----------

function detectOne(original: string, sentAt: Date): DetectedEventDraft | undefined {
  const lower = original.toLowerCase().replace(/[’`]/g, "'");
  if (!ACTIVITY_RE.test(lower)) return undefined; // BR-20: needs an activity or deadline word
  if (PAST_RE.test(lower)) return undefined; // BR-20: refers only to the past
  if (lower.trimEnd().endsWith('?')) return undefined; // BR-20: only asks about something

  const pkt = new Date(sentAt.getTime() + PKT_OFFSET_MS);
  const today = dayOf(pkt.getUTCFullYear(), pkt.getUTCMonth() + 1, pkt.getUTCDate());
  const rules: string[] = [];
  const uncertain = new Set<Mark>();

  const date = findDate(lower, today);
  let day: number | undefined;
  if (date) {
    day = date.day;
    rules.push(date.rule);
    if (date.uncertain) uncertain.add('date');
  } else if (PERIOD_RE.test(lower)) rules.push('period');
  else rules.push('no-date');

  const time = findTime(lower);
  let minutes: number | undefined;
  if (time && 'vague' in time) {
    rules.push('U8');
    uncertain.add('time');
  } else if (time) {
    minutes = time.minutes;
    rules.push(time.rule);
    if (time.uncertain) uncertain.add('time');
    if (time.nextDay) {
      if (day !== undefined) day += DAY_MS;
      uncertain.add('date');
    }
  }
  if (TENTATIVE_RE.test(lower)) {
    rules.push('U9');
    uncertain.add('event');
  }

  // BR-20: the activity must be at or after the sent time.
  if (day !== undefined) {
    const startsAt = day + (minutes ?? 24 * 60 - 1) * 60_000 - PKT_OFFSET_MS;
    if (startsAt < sentAt.getTime()) return undefined;
  }

  const hhmm = minutes === undefined ? null : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return {
    title: buildTitle(original, lower),
    date: day === undefined ? null : isoDay(day),
    time: hhmm,
    place: findPlace(original, lower),
    uncertain: (['date', 'time', 'event'] as const).filter((x) => uncertain.has(x)),
    rules,
  };
}

/** FR-05: the Detected Event drafts in one message. Urdu script gives none (AC-05.5). */
export function detect(text: string, sentAt: Date): DetectedEventDraft[] {
  if (URDU_SCRIPT.test(text)) return [];
  // BR-17: several Events on separate lines or sentences give one draft each.
  const parts = text.split(/\n+|(?<=[.!])\s+/).filter((p) => ACTIVITY_RE.test(p.toLowerCase()));
  const units = parts.length >= 2 ? parts : [text];
  return units.map((u) => detectOne(u, sentAt)).filter((d): d is DetectedEventDraft => d !== undefined);
}
