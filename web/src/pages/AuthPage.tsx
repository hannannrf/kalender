import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api';
import { useSession } from '../session';
import styles from './AuthPage.module.css';

type Mode = 'sign-in' | 'create';
type Errors = { email?: string; password?: string; form?: string };

const copy = {
  'sign-in': { title: 'Sign in', button: 'Sign in', busy: 'Signing in…', switchText: 'New to Kalender?', switchLink: 'Create an account', switchTo: '/create-account' },
  create: { title: 'Create your account', button: 'Create account', busy: 'Creating account…', switchText: 'Already have an account?', switchLink: 'Sign in', switchTo: '/sign-in' },
};

// What Kalender produces, shown with the Chat colours from docs/design/ui-direction.md.
const preview = [
  { colour: 'var(--chat-2)', chat: 'Project Team', title: 'Project meeting', when: 'Kal, 5:00 pm' },
  { colour: 'var(--chat-1)', chat: 'SE-3D Class', title: 'Quiz 2', when: 'Thursday' },
  { colour: 'var(--chat-3)', chat: 'Society Core', title: 'Core team meetup', when: 'Saturday, 11:00 am' },
];

export function AuthPage({ mode }: { mode: Mode }) {
  const session = useSession();
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const text = copy[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    setBusy(true);
    setErrors({});
    try {
      await (mode === 'create' ? session.register(email, password) : session.signIn(email, password));
    } catch (err) {
      if (err instanceof ApiError && err.body.fields) setErrors(err.body.fields);
      else if (err instanceof ApiError && err.body.message) setErrors({ form: err.body.message });
      else setErrors({ form: 'Kalender could not reach the server. Check your connection and try again.' });
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <h1 className={styles.wordmark}>Kalender</h1>
        <p className={styles.lede}>Meetings and deadlines from your WhatsApp groups, checked by you and reminded on time.</p>
        <ul className={styles.preview} aria-label="Example Events">
          {preview.map((event) => (
            <li key={event.title} style={{ borderLeftColor: event.colour }}>
              <span className={styles.previewTitle}>{event.title}</span>
              <span className={styles.previewMeta}>
                {event.when}, from {event.chat}
              </span>
            </li>
          ))}
        </ul>
      </header>

      <form className={styles.card} onSubmit={submit} noValidate aria-labelledby="auth-title">
        <h2 id="auth-title">{text.title}</h2>

        {session.status === 'signed-out' && session.notice && (
          <p className={styles.notice} role="status">
            {session.notice}
          </p>
        )}

        {errors.form && (
          <p className={styles.formError} role="alert">
            {errors.form}
          </p>
        )}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className={styles.fieldError}>
              {errors.email}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={[mode === 'create' && 'password-hint', errors.password && 'password-error'].filter(Boolean).join(' ') || undefined}
          />
          {mode === 'create' && !errors.password && (
            <p id="password-hint" className={styles.hint}>
              At least 8 characters.
            </p>
          )}
          {errors.password && (
            <p id="password-error" className={styles.fieldError}>
              {errors.password}
            </p>
          )}
        </div>

        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? text.busy : text.button}
        </button>

        <p className={styles.switch}>
          {text.switchText} <Link to={text.switchTo}>{text.switchLink}</Link>
        </p>
      </form>
    </main>
  );
}
