// S00 placeholder screens. Each grows into its own file in the slice that fills it.
import { useEffect, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { useSession } from '../session';
import styles from './Page.module.css';

export function InboxPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Inbox</h1>
      <EmptyState title="Nothing to check">
        Upload a Chat Export from Chats. The Events Kalender finds wait here until you check them.
      </EmptyState>
    </main>
  );
}

export function EventsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Events</h1>
      <EmptyState title="No upcoming Events">Confirm a Detected Event from your Inbox and it appears here.</EmptyState>
    </main>
  );
}

type Health = { status: string; db: string };
const dbText: Record<string, string> = {
  ok: 'Connected',
  not_configured: 'Not set up yet',
  unreachable: 'Not reachable',
};

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
