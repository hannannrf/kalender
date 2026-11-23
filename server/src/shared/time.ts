// Pakistan Standard Time is UTC+5 with no daylight saving (PRD BR-12, AGENTS.md section 5).
export const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The UTC instant of a PKT wall-clock time. Month is 1 to 12. */
export function pktToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - PKT_OFFSET_MS);
}

export function startOfMinute(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 60_000) * 60_000);
}
