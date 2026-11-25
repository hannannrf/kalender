// S00 placeholder screens. Each grows into its own file in the slice that fills it.
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { LEAD_MINUTES, leadText } from '../format';
import { pushState, turnOff, turnOn, type PushState } from '../push';
import { useSession } from '../session';
import styles from './Page.module.css';

type Health = { status: string; db: string };
const dbText: Record<string, string> = {
  ok: 'Connected',
  not_configured: 'Not set up yet',
  unreachable: 'Not reachable',
};

/** FR-10, BR-19: the default Lead Time. A change moves every upcoming Reminder that uses the default. */
function DefaultLeadTime() {
  const [lead, setLead] = useState<number | 'error' | undefined>();
  const [status, setStatus] = useState('');

  useEffect(() => {
    api<{ defaultLeadMinutes: number }>('/settings/reminders').then((s) => setLead(s.defaultLeadMinutes), () => setLead('error'));
  }, []);

  async function choose(minutes: number) {
    const before = lead;
    setLead(minutes);
    setStatus('Saving…');
    try {
      await api('/settings/reminders', { method: 'PUT', body: { defaultLeadMinutes: minutes } });
      setStatus(`Saved. Reminders come ${leadText(minutes)} before each Event.`);
    } catch {
      setLead(before);
      setStatus('Kalender could not save this. Try again.');
    }
  }

  return (
    <section className={styles.rows} aria-labelledby="reminders-heading">
      <h2 id="reminders-heading" className={styles.sectionTitle}>Reminders</h2>
      {lead === 'error' ? (
        <p className={styles.row}>Kalender could not load your Reminder setting.</p>
      ) : (
        <fieldset className={styles.choiceSet} disabled={lead === undefined}>
          <legend className={styles.label}>Remind me before each Event</legend>
          <div className={styles.segments}>
            {LEAD_MINUTES.map((m) => (
              <label key={m} className={styles.segment}>
                <input type="radio" name="lead" value={m} checked={lead === m} onChange={() => choose(m)} />
                <span>{leadText(m)}</span>
              </label>
            ))}
          </div>
          <p className={styles.note} role="status">
            {status || 'Applies to new Events and to upcoming Events that use the default. An All-day Event counts from 9:00 am.'}
          </p>
        </fieldset>
      )}
    </section>
  );
}

/** FR-09, C-05 (S10): phone notifications for this phone. Reminders always show inside Kalender too. */
const pushText: Record<PushState, string> = {
  unavailable: 'This browser cannot show phone notifications. Your Reminders still show here in Kalender.',
  'add-to-home-screen': 'On iPhone, add Kalender to your Home Screen first: tap Share, then Add to Home Screen, and open it from there. Your Reminders still show here in Kalender.',
  'not-set-up': 'Phone notifications are not set up on this server yet. Your Reminders still show here in Kalender.',
  blocked: 'Notifications for Kalender are blocked on this phone. Allow them in your browser or phone settings, then come back. Your Reminders still show here in Kalender.',
  off: 'Get each Reminder on this phone, even when Kalender is closed. Your Reminders also show here in Kalender.',
  on: 'This phone gets each Reminder as a notification. Your Reminders also show here in Kalender.',
};

const pushLabel: Record<PushState, string> = {
  unavailable: 'Not available here',
  'add-to-home-screen': 'Add to Home Screen first',
  'not-set-up': 'Not available yet',
  blocked: 'Blocked on this phone',
  off: 'Off for this phone',
  on: 'On for this phone',
};

function PhoneNotifications() {
  const [state, setState] = useState<PushState | 'error' | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState, () => setState('error'));
  }, []);

  async function change(action: () => Promise<PushState>) {
    setBusy(true);
    try {
      setState(await action());
    } catch {
      setState('error');
    }
    setBusy(false);
  }

  const button =
    state === 'off' ? (
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => change(turnOn)}>
        {busy ? 'Turning on…' : 'Turn on phone notifications'}
      </button>
    ) : state === 'on' ? (
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => change(turnOff)}>
        {busy ? 'Turning off…' : 'Turn off'}
      </button>
    ) : null;

  return (
    <section className={styles.rows} aria-labelledby="push-heading">
      <h2 id="push-heading" className={styles.sectionTitle}>
        Phone notifications
      </h2>
      <div className={`${styles.row} ${styles.stacked}`}>
        <span className={styles.value}>{state === undefined ? 'Checking…' : state === 'error' ? 'Could not check' : pushLabel[state]}</span>
        <p className={styles.note} role="status">
          {state === undefined ? '' : state === 'error' ? 'Kalender could not reach the server. Your Reminders still show here in Kalender.' : pushText[state]}
        </p>
        {button}
      </div>
    </section>
  );
}

/** FR-08, FR-13, MF-06 (S11): connect Google Calendar, see whether it still works, and unlink it. */
type CalendarStatus = 'not_configured' | 'not_linked' | 'linked' | 'needs_reconnect';

const calendarLabel: Record<CalendarStatus, string> = {
  not_configured: 'Not available yet',
  not_linked: 'Not connected',
  linked: 'Connected',
  needs_reconnect: 'Needs connecting again',
};

const calendarText: Record<CalendarStatus, string> = {
  not_configured: 'Google Calendar is not set up on this server yet. Your Events and Reminders still work in Kalender.',
  not_linked: 'Copy each Event you confirm to your Google Calendar. Edits and deletes in Kalender update the copy. Changes made in Google Calendar are not brought back.',
  linked: 'Each Event you confirm is copied to your primary Google Calendar. Edits and deletes in Kalender update the copy.',
  needs_reconnect: 'Google access ended. Connect again to keep your calendar up to date.',
};

/** The outcome Google's consent screen sends back to /settings?calendar=... */
const linkResult: Record<string, string> = {
  linked: 'Google Calendar is connected. Your upcoming Events are being copied to it.',
  denied: 'Google Calendar is not connected, because access was not allowed.',
  failed: 'Kalender could not connect Google Calendar. Try again.',
};

function GoogleCalendar() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<CalendarStatus | 'error' | undefined>();
  const [notice, setNotice] = useState(() => linkResult[params.get('calendar') ?? '']);
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    if (params.has('calendar')) setParams({}, { replace: true }); // the outcome shows once, not again on reload
    api<{ status: CalendarStatus }>('/calendar').then((r) => setStatus(r.status), () => setStatus('error'));
  }, []); // once on open

  async function connect() {
    setBusy(true);
    setProblem(undefined);
    try {
      window.location.assign((await api<{ url: string }>('/calendar/link', { method: 'POST' })).url);
    } catch {
      setProblem('Kalender could not reach the server. Try again.');
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setProblem(undefined);
    try {
      await api('/calendar', { method: 'DELETE' });
      setStatus('not_linked');
      setUnlinking(false);
      setNotice('Google Calendar is unlinked. Copies already in it stay there.');
    } catch {
      setProblem('Kalender could not unlink Google Calendar. Try again.');
    }
    setBusy(false);
  }

  const known = status !== undefined && status !== 'error';
  const canConnect = status === 'not_linked' || status === 'needs_reconnect';
  const canUnlink = status === 'linked' || status === 'needs_reconnect';

  return (
    <section className={styles.rows} aria-labelledby="calendar-heading">
      <h2 id="calendar-heading" className={styles.sectionTitle}>
        Google Calendar
      </h2>
      <div className={`${styles.row} ${styles.stacked}`}>
        <span className={styles.value}>{status === undefined ? 'Checking…' : status === 'error' ? 'Could not check' : calendarLabel[status]}</span>
        <p className={styles.note} role="status">
          {notice ?? (known ? calendarText[status] : status === 'error' ? 'Kalender could not reach the server.' : '')}
        </p>
        {problem && (
          <p className={styles.fieldError} role="alert">
            {problem}
          </p>
        )}
        {canConnect && !unlinking && (
          <button type="button" className={styles.secondary} disabled={busy} onClick={connect}>
            {busy ? 'Opening Google…' : status === 'needs_reconnect' ? 'Connect again' : 'Connect Google Calendar'}
          </button>
        )}
        {canUnlink && !unlinking && (
          <button type="button" className={styles.textButton} disabled={busy} onClick={() => setUnlinking(true)}>
            Unlink Google Calendar
          </button>
        )}
        {unlinking && (
          <div className={styles.unlink} role="group" aria-labelledby="unlink-question">
            <p id="unlink-question">Unlink Google Calendar? Kalender stops adding and updating Events there. Copies already in it stay.</p>
            <div className={styles.buttons}>
              <button type="button" className={styles.danger} disabled={busy} onClick={unlink}>
                {busy ? 'Unlinking…' : 'Unlink'}
              </button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => setUnlinking(false)}>
                Keep connected
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** FR-13, MF-07: deletes the account and everything it owns once the password is typed again. */
function DeleteAccount() {
  const session = useSession();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(undefined);
    try {
      await session.deleteAccount(password);
    } catch (err) {
      setError(err instanceof ApiError && err.body.fields?.password ? err.body.fields.password : 'Kalender could not reach the server. Your account is not deleted.');
      setBusy(false);
    }
  }

  return (
    <section className={styles.rows} aria-labelledby="delete-heading">
      <h2 id="delete-heading" className={styles.sectionTitle}>
        Delete account
      </h2>
      <form className={styles.deleteForm} onSubmit={submit} noValidate>
        <p>
          This deletes your account, your Approved Chats, Detected and Confirmed Events, Reminders and settings. It cannot be undone. Copies already in Google
          Calendar stay there.
        </p>
        <label htmlFor="delete-password">Type your password to confirm</label>
        <input
          id="delete-password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'delete-error' : undefined}
        />
        {error && (
          <p id="delete-error" className={styles.fieldError}>
            {error}
          </p>
        )}
        <button type="submit" className={styles.danger} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </form>
    </section>
  );
}

export function SettingsPage() {
  const session = useSession();
  const [health, setHealth] = useState<Health | 'error' | undefined>();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth('error'));
  }, []);

  const server = health === undefined ? 'Checking…' : health === 'error' ? 'Not reachable' : 'Online';
  const db = health === undefined || health === 'error' ? '–' : (dbText[health.db] ?? health.db);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Settings</h1>
      <section className={styles.rows} aria-labelledby="account-heading">
        <h2 id="account-heading" className={styles.sectionTitle}>Account</h2>
        <div className={`${styles.row} ${styles.stacked}`}>
          <span className={styles.label}>Signed in as</span>
          <span className={styles.value}>{session.status === 'signed-in' ? session.account.email : ''}</span>
        </div>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.secondary}
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              session.signOut().catch(() => setSigningOut(false));
            }}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>
      <DefaultLeadTime />
      <PhoneNotifications />
      <GoogleCalendar />
      <DeleteAccount />
      <section className={styles.rows} aria-label="System status" aria-live="polite">
        <div className={styles.row}>
          <span className={styles.label}>Server</span>
          <span>{server}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>Database</span>
          <span>{db}</span>
        </div>
      </section>
    </main>
  );
}
