// S00 placeholder screens. Each grows into its own file in the slice that fills it.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { LEAD_MINUTES, leadText } from '../format';
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
