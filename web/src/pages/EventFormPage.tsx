// Add a Manual Event (FR-07) or edit and delete a Confirmed Event (FR-12). Errors sit under their field.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState } from '../components/EmptyState';
import pageStyles from './Page.module.css';
import styles from './ReviewPage.module.css';
import own from './EventFormPage.module.css';

type ConfirmedEvent = {
  id: string;
  chat: { name: string | null; colour: number | null };
  title: string;
  date: string;
  time: string | null;
  place: string | null;
};
type Draft = { title: string; date: string; time: string | null; place: string };

const EMPTY: Draft = { title: '', date: '', time: null, place: '' };
const draftOf = (e: ConfirmedEvent): Draft => ({ title: e.title, date: e.date, time: e.time, place: e.place ?? '' });

export function EventFormPage() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const [event, setEvent] = useState<ConfirmedEvent | 'gone' | 'error' | undefined>();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api<ConfirmedEvent>(`/events/${id}`).then(
      (e) => {
        setEvent(e);
        setDraft(draftOf(e));
      },
      (err) => setEvent(err instanceof ApiError && err.status === 404 ? 'gone' : 'error'),
    );
  }, [editing, id]);

  if (editing && event === undefined) {
    return (
      <main className={pageStyles.page}>
        <p className={pageStyles.loading} role="status">
          Loading the Event…
        </p>
      </main>
    );
  }
  if (event === 'gone' || event === 'error') {
    return (
      <main className={pageStyles.page}>
        <EmptyState title={event === 'gone' ? 'This Event no longer exists' : 'Kalender could not load this Event'}>
          <Link to="/events">Back to Events</Link>
        </EmptyState>
      </main>
    );
  }

  const loaded = event; // narrowed: the Event being edited, or undefined when adding
  const change = (field: keyof Draft, value: string | null) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
    setProblem(undefined);
  };

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setProblem(undefined);
    try {
      await work();
      navigate('/events');
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setErrors(err.body.fields);
      setProblem(
        err instanceof ApiError && err.body.message
          ? err.body.message
          : err instanceof ApiError && err.status === 400
            ? 'Fix the details marked above.'
            : err instanceof ApiError && err.status === 404
              ? 'This Event no longer exists.'
              : 'Kalender could not reach the server. Try again.',
      );
      setBusy(false);
    }
  }

  function save() {
    if (!loaded) return run(() => api('/events', { method: 'POST', body: { ...draft, place: draft.place || null } }));
    // Only the details the User changed are sent (FR-12).
    const before = draftOf(loaded);
    const body = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== before[k as keyof Draft]));
    return run(() => api(`/events/${loaded.id}`, { method: 'PATCH', body }));
  }

  const error = (field: string) => errors[field] && <p className={styles.fieldError}>{errors[field]}</p>;
  const source = event ? (event.chat.name ?? 'Manual') : undefined;

  return (
    <main className={pageStyles.page}>
      <Link to="/events" className={styles.back}>
        Events
      </Link>
      <header className={own.header}>
        <h1 className={pageStyles.title}>{editing ? 'Edit Event' : 'Add Event'}</h1>
        {source && (
          <p className={own.source}>
            <span className={own.dot} style={{ background: event && event.chat.colour ? `var(--chat-${event.chat.colour})` : 'var(--chat-manual)' }} />
            {source}
          </p>
        )}
      </header>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor="title">Event</label>
          <input id="title" value={draft.title} maxLength={60} onChange={(e) => change('title', e.target.value)} placeholder="Quiz, meeting, deadline" />
          {error('title')}
        </div>

        <div className={styles.field}>
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={draft.date} onChange={(e) => change('date', e.target.value)} />
          {error('date')}
        </div>

        <div className={styles.field}>
          <label htmlFor="time">Time</label>
          <div className={styles.timeRow}>
            <input id="time" type="time" value={draft.time ?? ''} disabled={draft.time === null} onChange={(e) => change('time', e.target.value || null)} />
            <label className={styles.allDay}>
              <input type="checkbox" checked={draft.time === null} onChange={(e) => change('time', e.target.checked ? null : '09:00')} />
              All day
            </label>
          </div>
          {error('time')}
        </div>

        <div className={styles.field}>
          <label htmlFor="place">Place</label>
          <input id="place" value={draft.place} maxLength={40} onChange={(e) => change('place', e.target.value)} placeholder="No place" />
          {error('place')}
        </div>
      </div>

      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={busy} onClick={save}>
          {busy && !deleting ? 'Saving…' : editing ? 'Save changes' : 'Add Event'}
        </button>
        {event && !deleting && (
          <button type="button" className={own.delete} disabled={busy} onClick={() => setDeleting(true)}>
            Delete Event
          </button>
        )}
        {event && deleting && (
          <div className={own.confirm} role="group" aria-labelledby="delete-question">
            <p id="delete-question" className={own.question}>
              Delete this Event?
            </p>
            <div className={styles.choices}>
              <button type="button" className={own.yes} disabled={busy} onClick={() => run(() => api(`/events/${event.id}`, { method: 'DELETE' }))}>
                {busy ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setDeleting(false)}>
                Keep
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
