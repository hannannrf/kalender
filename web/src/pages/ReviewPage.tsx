// Review a Detected Event (FR-06, BR-21): every Uncertain detail must be kept or changed before Confirm is enabled.
// A Possible Duplicate (BR-04, BR-13) shows the existing Event and offers update, add or dismiss.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { EmptyState } from '../components/EmptyState';
import { AlertIcon } from '../components/icons';
import { dayText, sentText, timeText } from '../format';
import pageStyles from './Page.module.css';
import styles from './ReviewPage.module.css';

type Mark = 'date' | 'time' | 'event';
type Existing = { kind: 'confirmed' | 'detected'; id: string; title: string; date: string; time: string | null; place: string | null };
type Detail = {
  id: string;
  chat: { name: string; colour: number };
  title: string;
  date: string | null;
  time: string | null;
  place: string | null;
  uncertain: Mark[];
  rules: string[];
  possibleDuplicate: Existing | null;
  message: { sender: string; text: string; sentAt: string };
};
type Draft = { title: string; date: string; time: string | null; place: string };

// One-line reasons for how each detail was read (ui-direction.md). Uncertain rules (BR-21) come first.
const DATE_REASONS: [string, string][] = [
  ['U2', '12 at night is the start of the next day.'],
  ['U3', 'This date could be day/month or month/day.'],
  ['U4', '"Next" is read as the following week.'],
  ['U5', 'The day named is the weekday the message was sent, so a week later.'],
  ['U6', 'The day name does not match the date; the date is used.'],
  ['U7', 'Two dates were given; the first is used.'],
  ['kal', 'kal means tomorrow.'],
  ['parson', 'parson means the day after tomorrow.'],
  ['aaj', 'aaj means today.'],
  ['day-name', 'The next day with that name after the message.'],
  ['period', 'The message names a period, not one date.'],
  ['no-date', 'The message gives no date.'],
];
const TIME_REASONS: [string, string][] = [
  ['U1', 'The message gives no am or pm.'],
  ['U2', '12 at night is 00:00 of the next day.'],
  ['U8', 'The message gives no clock time.'],
  ['range-start', 'The start of the time range.'],
];
const reasonOf = (rules: string[], table: [string, string][]) => table.find(([rule]) => rules.includes(rule))?.[1];

/** The other reading of a time marked U1: 5:00 pm becomes 5:00 am, and back. */
function otherHalf(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 12) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function CheckZone({ children, choices }: { children: ReactNode; choices: { label: string; onClick: () => void }[] }) {
  return (
    <div className={styles.check}>
      <p className={styles.checkTitle}>
        <AlertIcon />
        Check this
      </p>
      <p>{children}</p>
      <div className={styles.choices}>
        {choices.map((c) => (
          <button key={c.label} type="button" className={styles.choice} onClick={c.onClick}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function confirmLabel(open: Mark[], needsDate: boolean) {
  if (needsDate) return 'Add a date to confirm';
  if (open.length === 0) return 'Confirm Event';
  const names = open.map((m) => (m === 'event' ? 'Event' : m));
  return `Check the ${names.join(' and ')} to confirm`;
}

export function ReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | 'gone' | 'error' | undefined>();
  const [draft, setDraft] = useState<Draft>({ title: '', date: '', time: null, place: '' });
  const [reviewed, setReviewed] = useState<Set<Mark>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Detail>(`/detected-events/${id}`).then(
      (d) => {
        setDetail(d);
        setDraft({ title: d.title, date: d.date ?? '', time: d.time, place: d.place ?? '' });
      },
      (err) => setDetail(err instanceof ApiError && err.status === 404 ? 'gone' : 'error'),
    );
  }, [id]);

  if (detail === undefined) {
    return (
      <main className={pageStyles.page}>
        <p className={pageStyles.loading} role="status">
          Loading the Event…
        </p>
      </main>
    );
  }
  if (detail === 'gone' || detail === 'error') {
    return (
      <main className={pageStyles.page}>
        <EmptyState title={detail === 'gone' ? 'This Event is no longer in your Inbox' : 'Kalender could not load this Event'}>
          <Link to="/">Back to Inbox</Link>
        </EmptyState>
      </main>
    );
  }

  const review = (mark: Mark) => setReviewed((r) => new Set(r).add(mark));
  const change = (field: keyof Draft, value: string | null, mark?: Mark) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => ({ ...e, [field]: '' }));
    if (mark) review(mark);
  };
  const open = detail.uncertain.filter((m) => !reviewed.has(m));
  const needsDate = draft.date === '';

  /** Saves the edits and reviewed marks, then runs `next`. Errors land under the fields and in the problem line. */
  async function saveThen(next: (d: Detail) => Promise<void>) {
    if (typeof detail !== 'object') return;
    setBusy(true);
    setProblem(undefined);
    const body: Record<string, unknown> = { accept: [...reviewed] };
    if (draft.title !== detail.title) body.title = draft.title;
    if (draft.date !== (detail.date ?? '')) body.date = draft.date;
    if (draft.time !== detail.time) body.time = draft.time;
    if (draft.place !== (detail.place ?? '')) body.place = draft.place;
    try {
      await api(`/detected-events/${detail.id}/review`, { method: 'POST', body });
      await next(detail);
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setErrors(err.body.fields);
      setProblem(err instanceof ApiError && err.body.message ? err.body.message : err instanceof ApiError && err.status === 400 ? 'Fix the details marked above.' : 'Kalender could not reach the server. Try again.');
      setBusy(false);
    }
  }

  const confirmEvent = () =>
    saveThen(async (d) => {
      await api(`/detected-events/${d.id}/confirm`, { method: 'POST' });
      navigate('/events', { state: { notice: `${d.title} confirmed` } });
    });

  // BR-13: a Confirmed Event moves (the Events list then shows it); an older Detected Event leaves, and this one stays to confirm.
  const updateExisting = (existing: Existing) =>
    saveThen(async (d) => {
      const body = { choice: 'update', existingId: existing.id };
      const updated = await api<Omit<Detail, 'message'>>(`/detected-events/${d.id}/duplicate`, { method: 'POST', body });
      if (existing.kind === 'confirmed') return navigate('/events');
      setDetail({ ...d, ...updated });
      setNotice(`The older "${existing.title}" was removed from your Inbox. Confirm this one when it is right.`);
      setBusy(false);
    });

  async function dismissEvent() {
    if (typeof detail !== 'object') return;
    setBusy(true);
    try {
      await api(`/detected-events/${detail.id}/dismiss`, { method: 'POST' });
      navigate('/', { state: { notice: `${detail.title} dismissed` } });
    } catch {
      setProblem('Kalender could not reach the server. Try again.');
      setBusy(false);
    }
  }

  const marked = (m: Mark) => open.includes(m);
  const dup = detail.possibleDuplicate;
  const blocked = open.length > 0 || needsDate; // the Confirm gate (FR-06, BR-21)
  const error = (field: string) => errors[field] && <p className={styles.fieldError}>{errors[field]}</p>;

  return (
    <main className={pageStyles.page}>
      <Link to="/" className={styles.back}>
        Inbox
      </Link>
      <header className={styles.band} style={{ background: `var(--chat-${detail.chat.colour})` }}>
        <h1 className={styles.chatName}>{detail.chat.name}</h1>
      </header>

      <figure className={styles.quote}>
        <figcaption>
          {detail.message.sender}, {sentText(detail.message.sentAt)}
        </figcaption>
        <blockquote>{detail.message.text}</blockquote>
      </figure>

      {dup && (
        <section className={styles.duplicate} aria-labelledby="duplicate-title">
          <h2 id="duplicate-title" className={styles.readAs}>
            Possible Duplicate
          </h2>
          <p>You already have an Event from this Chat on the same day. It may be the same one.</p>
          <div className={styles.existing} style={{ borderLeftColor: `var(--chat-${detail.chat.colour})` }}>
            <p className={styles.existingTitle}>{dup.title}</p>
            <p>
              {dayText(dup.date)}, {dup.time ? timeText(dup.time) : 'All day'}
            </p>
            {dup.place && <p>{dup.place}</p>}
            <p className={styles.reason}>{dup.kind === 'confirmed' ? 'Confirmed Event' : 'Waiting in your Inbox'}</p>
          </div>
          <p className={styles.reason}>
            {dup.kind === 'confirmed'
              ? 'Update moves that Event and its Reminder to the date and time below. Its title stays, and a new place replaces the old one.'
              : 'Update removes the older one from your Inbox. This one stays for you to confirm.'}
          </p>
        </section>
      )}

      <h2 className={styles.readAs}>Kalender read it as</h2>
      <div className={styles.fields}>
        <div className={`${styles.field} ${marked('event') ? styles.open : ''}`}>
          <label htmlFor="title">Event</label>
          <input id="title" value={draft.title} maxLength={60} onChange={(e) => change('title', e.target.value)} />
          {error('title')}
          {marked('event') && (
            <CheckZone choices={[{ label: 'Keep this Event', onClick: () => review('event') }, { label: 'Dismiss', onClick: dismissEvent }]}>
              The message sounds unsure (maybe, shayad, if, plan).
            </CheckZone>
          )}
        </div>

        <div className={`${styles.field} ${marked('date') || needsDate ? styles.open : ''}`}>
          <label htmlFor="date">Date</label>
          <input id="date" ref={dateInput} type="date" value={draft.date} onChange={(e) => change('date', e.target.value, 'date')} />
          {!marked('date') && <p className={styles.reason}>{needsDate ? 'Needs date: the message names a period, not one date.' : reasonOf(detail.rules, DATE_REASONS)}</p>}
          {error('date')}
          {marked('date') && draft.date && (
            <CheckZone choices={[{ label: `Keep ${dayText(draft.date)}`, onClick: () => review('date') }, { label: 'Change date', onClick: () => dateInput.current?.focus() }]}>
              {reasonOf(detail.rules, DATE_REASONS)}
            </CheckZone>
          )}
        </div>

        <div className={`${styles.field} ${marked('time') ? styles.open : ''}`}>
          <label htmlFor="time">Time</label>
          <div className={styles.timeRow}>
            <input id="time" ref={timeInput} type="time" value={draft.time ?? ''} disabled={draft.time === null} onChange={(e) => change('time', e.target.value || null, 'time')} />
            <label className={styles.allDay}>
              <input type="checkbox" checked={draft.time === null} onChange={(e) => change('time', e.target.checked ? null : (detail.time ?? '09:00'), 'time')} />
              All day
            </label>
          </div>
          {!marked('time') && <p className={styles.reason}>{reasonOf(detail.rules, TIME_REASONS)}</p>}
          {error('time')}
          {marked('time') && (
            <CheckZone
              choices={
                draft.time && detail.rules.includes('U1')
                  ? [
                      { label: `Keep ${timeText(draft.time)}`, onClick: () => review('time') },
                      { label: `Use ${timeText(otherHalf(draft.time))}`, onClick: () => change('time', otherHalf(draft.time!), 'time') },
                    ]
                  : [
                      { label: draft.time ? `Keep ${timeText(draft.time)}` : 'Keep All day', onClick: () => review('time') },
                      { label: 'Set a time', onClick: () => change('time', draft.time ?? '09:00', 'time') },
                    ]
              }
            >
              {reasonOf(detail.rules, TIME_REASONS)}
            </CheckZone>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="place">Place</label>
          <input id="place" value={draft.place} maxLength={40} onChange={(e) => change('place', e.target.value)} placeholder="No place" />
          {error('place')}
        </div>
      </div>

      <p className={styles.notice} role="status">
        {notice}
      </p>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      <div className={styles.actions}>
        {dup && (
          <button type="button" className={styles.primary} disabled={busy || (dup.kind === 'confirmed' && blocked)} onClick={() => updateExisting(dup)}>
            {busy ? 'Saving…' : dup.kind === 'confirmed' && blocked ? confirmLabel(open, needsDate).replace('to confirm', 'to update') : 'Update the existing Event'}
          </button>
        )}
        <button type="button" className={dup ? styles.secondary : styles.primary} disabled={busy || blocked} onClick={confirmEvent}>
          {busy && !dup ? 'Saving…' : dup && !blocked ? 'Add as a new Event' : confirmLabel(open, needsDate)}
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={dismissEvent}>
          Dismiss
        </button>
      </div>
    </main>
  );
}
