// Approve a Chat from its export (FR-02, BR-15) and list Approved Chats. Update and Revoke arrive in S05.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { FileUploadIcon } from '../components/icons';
import pageStyles from './Page.module.css';
import styles from './ChatsPage.module.css';

type Chat = { id: string; name: string; colour: number; lookBackDays: number; approvedAt: string; lastUploadAt: string };
type Approved = { chat: Chat; messagesRead: number; detectedEvents: number };

const MAX_BYTES = 4 * 1024 * 1024; // same limit as the server (architecture section 6.2)
const LOOK_BACK = [1, 3, 7] as const;

const when = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const reasonOf = (err: unknown) =>
  err instanceof ApiError && err.body.message ? err.body.message : 'Kalender could not reach the server. Check your connection and try again.';

type Step =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; file: File; nameFromFile: string | null }
  | { kind: 'approving'; file: File; nameFromFile: string | null };

export function ChatsPage() {
  const [chats, setChats] = useState<Chat[] | 'error' | undefined>();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [problem, setProblem] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [done, setDone] = useState<Approved>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Chat[]>('/chats').then(setChats, () => setChats('error'));
  }, []);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be picked again after a refusal
    if (!file) return;
    setProblem(undefined);
    setDone(undefined);
    if (file.size > MAX_BYTES) {
      setProblem('This file is over 4 MB. Export the Chat again without media.');
      return;
    }
    setStep({ kind: 'checking' });
    const body = new FormData();
    body.append('file', file);
    try {
      const preview = await api<{ chatNameFromFile: string | null }>('/chats/preview', { method: 'POST', body });
      setStep({ kind: 'confirm', file, nameFromFile: preview.chatNameFromFile });
    } catch (err) {
      setProblem(reasonOf(err));
      setStep({ kind: 'idle' });
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== 'confirm') return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) {
      setFieldError('Enter the Chat name.');
      return;
    }
    setFieldError(undefined);
    setStep({ ...step, kind: 'approving' });
    const body = new FormData();
    body.append('name', name);
    body.append('lookBackDays', String(form.get('lookBackDays')));
    body.append('file', step.file);
    try {
      const result = await api<Approved>('/chats', { method: 'POST', body });
      setDone(result);
      setChats((list) => [result.chat, ...(Array.isArray(list) ? list : [])]);
      setStep({ kind: 'idle' }); // drops the file from memory (architecture section 6.2)
    } catch (err) {
      if (err instanceof ApiError && err.body.fields?.name) setFieldError(err.body.fields.name);
      else setProblem(reasonOf(err));
      setStep({ ...step, kind: 'confirm' });
    }
  }

  const confirming = step.kind === 'confirm' || step.kind === 'approving';

  return (
    <main className={pageStyles.page}>
      <h1 className={pageStyles.title}>Chats</h1>

      {done && (
        <p className={styles.done} role="status">
          <strong>{done.chat.name}</strong> approved.{' '}
          {done.messagesRead === 0
            ? `No messages from the last ${done.chat.lookBackDays === 1 ? 'day' : `${done.chat.lookBackDays} days`}, so nothing was read.`
            : `${done.messagesRead === 1 ? '1 message' : `${done.messagesRead} messages`} read.`}
        </p>
      )}

      {confirming ? (
        <form className={styles.sheet} onSubmit={approve} aria-labelledby="confirm-title">
          <h2 id="confirm-title">Approve this Chat</h2>
          <p className={styles.fileName}>{step.file.name}</p>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <div className={styles.field}>
            <label htmlFor="chat-name">Chat name</label>
            <input
              id="chat-name"
              name="name"
              defaultValue={step.nameFromFile ?? ''}
              maxLength={100}
              autoComplete="off"
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'chat-name-error' : 'chat-name-hint'}
            />
            {fieldError ? (
              <p id="chat-name-error" className={styles.fieldError}>
                {fieldError}
              </p>
            ) : (
              <p id="chat-name-hint" className={styles.hint}>
                {step.nameFromFile ? 'Taken from the file name. Change it if you like.' : 'Type the name of this Chat.'}
              </p>
            )}
          </div>
          <fieldset className={styles.field}>
            <legend>Read messages from the last</legend>
            <div className={styles.segments}>
              {LOOK_BACK.map((days) => (
                <label key={days} className={styles.segment}>
                  <input type="radio" name="lookBackDays" value={days} defaultChecked={days === 7} />
                  <span>{days === 1 ? '1 day' : `${days} days`}</span>
                </label>
              ))}
            </div>
            <p className={styles.hint}>Older messages in the file are never read. Later uploads read only new messages.</p>
          </fieldset>
          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={step.kind === 'approving'}>
              {step.kind === 'approving' ? 'Approving…' : 'Approve Chat'}
            </button>
            <button
              className={pageStyles.secondary}
              type="button"
              disabled={step.kind === 'approving'}
              onClick={() => {
                setStep({ kind: 'idle' });
                setProblem(undefined);
                setFieldError(undefined);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <section className={styles.sheet} aria-labelledby="add-title">
          <h2 id="add-title">Approve a Chat</h2>
          <ol className={styles.steps}>
            <li>In WhatsApp, open the group or chat.</li>
            <li>Tap the menu, then More, then Export chat.</li>
            <li>Choose Without media and save the file.</li>
            <li>Choose that file here.</li>
          </ol>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <input ref={input} id="export-file" className={styles.fileInput} type="file" accept=".txt,text/plain" onChange={pick} />
          <button className={styles.primary} type="button" disabled={step.kind === 'checking'} onClick={() => input.current?.click()}>
            <FileUploadIcon />
            {step.kind === 'checking' ? 'Checking the file…' : 'Choose export file'}
          </button>
        </section>
      )}

      {chats === 'error' && <p className={styles.problem}>Your Approved Chats could not be loaded.</p>}
      {Array.isArray(chats) && chats.length > 0 && (
        <section aria-labelledby="approved-title">
          <h2 id="approved-title" className={styles.listTitle}>
            Approved Chats
          </h2>
          <ul className={styles.list}>
            {chats.map((chat) => (
              <li key={chat.id} style={{ borderLeftColor: `var(--chat-${chat.colour})` }}>
                <span className={styles.chatName}>{chat.name}</span>
                <span className={styles.meta}>Approved {when.format(new Date(chat.approvedAt))}</span>
                <span className={styles.meta}>Last upload {when.format(new Date(chat.lastUploadAt))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
