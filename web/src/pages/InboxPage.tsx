// Detected Events waiting for the User, grouped by Source Chat (FR-05). Each card opens the review screen (FR-06).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Notice } from '../components/Notice';
import { Placeholder } from '../components/Placeholder';
import { AlertIcon } from '../components/icons';
import { dayText, timeText } from '../format';
import pageStyles from './Page.module.css';
import styles from './InboxPage.module.css';

type DetectedEvent = {
  id: string;
  chat: { id: string; name: string; colour: number };
  title: string;
  date: string | null; // YYYY-MM-DD in PKT; null is "Needs date"
  time: string | null; // HH:MM in PKT; null is All-day
  place: string | null;
  uncertain: ('date' | 'time' | 'event')[];
  possibleDuplicate: { id: string } | null; // BR-04
};

function groupByChat(events: DetectedEvent[]) {
  const groups = new Map<string, { chat: DetectedEvent['chat']; events: DetectedEvent[] }>();
  for (const e of events) {
    const group = groups.get(e.chat.id) ?? { chat: e.chat, events: [] };
    group.events.push(e);
    groups.set(e.chat.id, group);
  }
  return [...groups.values()];
}

function Value({ marked, children }: { marked: boolean; children: string }) {
  return marked ? <mark className={styles.mark}>{children}</mark> : <>{children}</>;
}

function EventCard({ event }: { event: DetectedEvent }) {
  const check = event.uncertain.length > 0 || event.date === null;
  return (
    <li>
      <Link to={`/review/${event.id}`} className={styles.card} style={{ borderLeftColor: `var(--chat-${event.chat.colour})` }}>
        <p className={styles.title}>
          <Value marked={event.uncertain.includes('event')}>{event.title}</Value>
        </p>
        <p className={styles.when}>
          {event.date === null ? (
            <Value marked>Needs date</Value>
          ) : (
            <>
              <Value marked={event.uncertain.includes('date')}>{dayText(event.date)}</Value>
              {', '}
              <Value marked={event.uncertain.includes('time')}>{event.time ? timeText(event.time) : 'All day'}</Value>
            </>
          )}
        </p>
        {event.place && <p className={styles.place}>{event.place}</p>}
        {check && (
          <p className={styles.chip}>
            <AlertIcon />
            Check this
          </p>
        )}
        {event.possibleDuplicate && <p className={styles.duplicate}>Possible Duplicate</p>}
      </Link>
    </li>
  );
}

export function InboxPage() {
  const [events, setEvents] = useState<DetectedEvent[] | 'error' | undefined>();

  useEffect(() => {
    api<DetectedEvent[]>('/detected-events').then(setEvents, () => setEvents('error'));
  }, []);

  return (
    <main className={pageStyles.page}>
      <h1 className={pageStyles.title}>Inbox</h1>
      <Notice />
      {events === undefined && <Placeholder label="Loading your Inbox…" />}
      {events === 'error' && <p className={styles.problem}>Kalender could not load your Inbox. Check your connection and open it again.</p>}
      {Array.isArray(events) && events.length === 0 && (
        <EmptyState title="Nothing to check">
          Upload a Chat Export from Chats. The Events Kalender finds wait here until you check them.
        </EmptyState>
      )}
      {Array.isArray(events) &&
        groupByChat(events).map(({ chat, events: inChat }) => (
          <section key={chat.id} aria-labelledby={`chat-${chat.id}`} className={styles.group}>
            <h2 id={`chat-${chat.id}`} className={styles.chatName}>
              <span className={styles.dot} style={{ background: `var(--chat-${chat.colour})` }} aria-hidden="true" />
              {chat.name}
            </h2>
            <ul className={styles.list}>
              {inChat.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
