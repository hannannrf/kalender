// In-app Reminders (FR-09, C-05, AC-09.3): due Reminders shown at the top of every screen until marked Seen.
// Asked for on every screen change and every 30 seconds while the app is open and visible.
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { dayHeader, timeText } from '../format';
import { BellIcon } from './icons';
import styles from './ReminderCards.module.css';

type Notification = { id: string; eventId: string; title: string; date: string; time: string | null; kind: 'due' | 'late' | 'missed' };

const LABEL = { due: 'Reminder', late: 'Late Reminder', missed: 'Missed Reminder' };

export function ReminderCards() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(() => {
    if (document.visibilityState === 'visible') api<Notification[]>('/notifications').then(setItems, () => undefined);
  }, []);

  useEffect(load, [pathname, load]);
  useEffect(() => {
    const timer = setInterval(load, 30_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [load]);

  async function seen(id: string) {
    setItems((list) => list.filter((n) => n.id !== id));
    await api(`/notifications/${id}/seen`, { method: 'POST' }).catch(() => undefined);
  }

  if (items.length === 0) return null;
  return (
    <aside className={styles.stack} aria-label="Reminders" aria-live="polite">
      {items.map((n) => (
        <div key={n.id} className={`${styles.card} ${n.kind === 'due' ? '' : styles.quiet}`}>
          <span className={styles.icon}>
            <BellIcon />
          </span>
          <div className={styles.text}>
            <p className={styles.label}>{LABEL[n.kind]}</p>
            <p className={styles.title}>{n.title}</p>
            <p className={styles.when}>
              {dayHeader(n.date)}, {n.time ? timeText(n.time) : 'All day'}
            </p>
          </div>
          <button type="button" className={styles.seen} onClick={() => seen(n.id)} aria-label={`Seen: ${n.title}`}>
            Seen
          </button>
        </div>
      ))}
    </aside>
  );
}
