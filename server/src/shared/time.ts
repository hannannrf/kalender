// Pakistan Standard Time is UTC+5 with no daylight saving (PRD BR-12, AGENTS.md section 5).
export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The UTC instant of a PKT wall-clock time. Month is 1 to 12. */
export function pktToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - PKT_OFFSET_MS);
}

export function startOfMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000);
}

/** The PKT calendar date ("YYYY-MM-DD") and clock time ("HH:MM") of an instant. */
export function pktParts(at: Date): { date: string; time: string } {
  const iso = new Date(at.getTime() + PKT_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** The UTC instant an Event starts: its PKT time, or 00:00 PKT for All-day. Date is "YYYY-MM-DD", time "HH:MM" or null. */
export function eventStart(date: string, time: string | null): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time ?? '00:00').split(':').map(Number);
  return pktToUtc(y, m, d, h, min);
}
