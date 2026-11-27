// Upcoming Confirmed Events in date-and-time order under day headers (FR-11). Each opens its edit form (FR-12); Add Event makes a Manual Event (FR-07).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Notice } from '../components/Notice';
import { Placeholder } from '../components/Placeholder';
import { dayHeader, dayHeaderDate, timeText } from '../format';
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
          Add Event
        </Link>
      </header>
      <Notice />
      {events === undefined && <Placeholder label="Loading your Events…" />}
      {events === 'error' && <p className={styles.problem}>Kalender could not load your Events. Check your connection and open it again.</p>}
      {Array.isArray(events) && events.length === 0 && (
        <EmptyState title="No upcoming Events">Confirm a Detected Event from your Inbox, or add one yourself with Add Event.</EmptyState>
      )}
      {Array.isArray(events) &&
        byDay(events).map(([date, onDay]) => (
          <section key={date} aria-labelledby={`day-${date}`} className={styles.group}>
            <h2 id={`day-${date}`} className={styles.chatName}>
              {dayHeader(date)}
              {dayHeaderDate(date) && <span className={styles.headerDate}>{dayHeaderDate(date)}</span>}
            </h2>
            <ul className={styles.list}>
              {onDay.map((e) => (
                <li key={e.id}>
                  <Link to={`/events/${e.id}`} className={styles.card} style={{ borderLeftColor: e.chat.colour ? `var(--chat-${e.chat.colour})` : 'var(--chat-manual)' }}>
                    <p className={styles.title}>{e.title}</p>
                    <p className={styles.when}>{e.time ? timeText(e.time) : 'All day'}</p>
                    <p className={styles.place}>
                      <span className={styles.dot} style={{ background: e.chat.colour ? `var(--chat-${e.chat.colour})` : 'var(--chat-manual)' }} aria-hidden="true" />
                      {[e.chat.name ?? 'Manual', e.place].filter(Boolean).join(', ')}
                    </p>
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
