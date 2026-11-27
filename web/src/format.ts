// Event dates and times arrive as PKT calendar values ("YYYY-MM-DD", "HH:MM"), so they are formatted with no time zone shift.
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

export const dayText = (date: string) => dayFormat.format(new Date(`${date}T00:00:00Z`));

export function timeText(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Today's PKT date plus n days, as "YYYY-MM-DD". */
export function pktDate(plusDays = 0) {
  return new Date(Date.now() + 5 * 3_600_000 + plusDays * 86_400_000).toISOString().slice(0, 10);
}

/** Day headers on the Events list (ui-direction.md): Aaj, Kal, Parson, then weekday and date. */
export function dayHeader(date: string) {
  const near = ['Aaj', 'Kal', 'Parson'][[0, 1, 2].find((n) => pktDate(n) === date) ?? -1];
  return near ?? dayText(date);
}

/** The date under an Aaj, Kal or Parson header (S14-1); null when the header already is the date. */
export const dayHeaderDate = (date: string) => (dayHeader(date) === dayText(date) ? null : dayText(date));

const sentFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** An instant (ISO string) shown in PKT. */
export const sentText = (iso: string) => sentFormat.format(new Date(iso));

/** Lead Times the User may choose (BR-07). */
export const LEAD_MINUTES = [10, 30, 60, 1440] as const;
export const leadText = (minutes: number) => ({ 10: '10 minutes', 30: '30 minutes', 60: '1 hour', 1440: '1 day' })[minutes] ?? `${minutes} minutes`;

/** "in 40 min" or "in 5 hours" for a timed Event less than a day away (S15 Next up card); null otherwise. */
export function untilText(date: string, time: string | null, now = Date.now()) {
  if (!time) return null;
  const minutes = Math.round((Date.parse(`${date}T${time}:00+05:00`) - now) / 60_000);
  if (minutes < 0 || minutes >= 24 * 60) return null;
  if (minutes < 60) return minutes <= 1 ? 'starting now' : `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `in ${hours} hour${hours === 1 ? '' : 's'}`;
}
