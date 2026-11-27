// Upcoming Confirmed Events in date-and-time order under day headers (FR-11). Each opens its edit form (FR-12); Add Event makes a Manual Event (FR-07).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Notice } from '../components/Notice';
import { Placeholder } from '../components/Placeholder';
import { ChatAvatar, chatStyle } from '../components/ChatAvatar';
import { CalendarIcon, PlusIcon } from '../components/icons';
import { dayHeader, dayHeaderDate, timeText, untilText } from '../format';
import pageStyles from './Page.module.css';
import styles from './InboxPage.module.css';

type ConfirmedEvent = {
  id: string;
  chat: { name: string | null; colour: number | null };
  title: string;
  date: string;
  time: string | null;
  place: string | null;
  calendarFailed?: boolean; // GL-22, S11
};

function byDay(events: ConfirmedEvent[]) {
  const days = new Map<string, ConfirmedEvent[]>();
  for (const e of events) days.set(e.date, [...(days.get(e.date) ?? []), e]);
  return [...days];
}

/** "3:00" over "pm" in the time column; "All day" when there is no time. */
function Time({ time }: { time: string | null }) {
  if (!time) return <p className={styles.time}><small>All day</small></p>;
  const [clock, half] = timeText(time).split(' ');
  return (
    <p className={styles.time}>
      {clock}
      <small>{half}</small>
    </p>
  );
}

/** The soonest upcoming Event, large, on its Chat colour (S15). */
function NextUp({ event: e }: { event: ConfirmedEvent }) {
  const until = untilText(e.date, e.time);
  return (
    <Link to={`/events/${e.id}`} className={styles.next} style={chatStyle(e.chat.colour)}>
      <p className={styles.nextLabel}>
        <span>Next up</span>
        {until && <span>{until}</span>}
      </p>
      <h2 className={styles.nextTitle}>{e.title}</h2>
      <p className={styles.nextWhen}>
        {dayHeader(e.date)}
        {dayHeaderDate(e.date) && `, ${dayHeaderDate(e.date)}`}
        {', '}
        {e.time ? timeText(e.time) : 'All day'}
      </p>
      <p className={styles.nextWhere}>
        <ChatAvatar name={e.chat.name ?? 'Manual'} colour={e.chat.colour} large />
        {[e.chat.name ?? 'Manual', e.place].filter(Boolean).join(', ')}
      </p>
      {e.calendarFailed && <p className={styles.calendarFailed}>Calendar update failed</p>}
    </Link>
  );
}

export function EventsPage() {
  const [events, setEvents] = useState<ConfirmedEvent[] | 'error' | undefined>();

  useEffect(() => {
    api<ConfirmedEvent[]>('/events').then(setEvents, () => setEvents('error'));
  }, []);

  return (
    <main className={pageStyles.page}>
      <header className={pageStyles.titleRow}>
        <h1 className={pageStyles.title}>Events</h1>
        <Link to="/events/new" className={pageStyles.action}>
          <PlusIcon />
          Add Event
        </Link>
      </header>
      <Notice />
      {events === undefined && <Placeholder label="Loading your Events…" />}
      {events === 'error' && <p className={styles.problem}>Kalender could not load your Events. Check your connection and open it again.</p>}
      {Array.isArray(events) && events.length === 0 && (
        <EmptyState title="No upcoming Events" icon={<CalendarIcon />}>Confirm a Detected Event from your Inbox, or add one yourself with Add Event.</EmptyState>
      )}
      {Array.isArray(events) && events.length > 0 && <NextUp event={events[0]} />}
      {Array.isArray(events) &&
        byDay(events.slice(1)).map(([date, onDay]) => (
          <section key={date} aria-labelledby={`day-${date}`} className={styles.group}>
            <h2 id={`day-${date}`} className={styles.chatName}>
              {dayHeader(date)}
              {dayHeaderDate(date) && <span className={styles.headerDate}>{dayHeaderDate(date)}</span>}
            </h2>
            <ul className={styles.list}>
              {onDay.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`} className={`${styles.card} ${styles.timed}`} style={chatStyle(e.chat.colour)}>
                    <Time time={e.time} />
                    <p className={styles.title}>{e.title}</p>
                    <p className={styles.place}>{[e.chat.name ?? 'Manual', e.place].filter(Boolean).join(', ')}</p>
                    {e.calendarFailed && <p className={styles.calendarFailed}>Calendar update failed</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
