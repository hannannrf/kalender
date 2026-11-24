// Approve a Chat from its export (FR-02, BR-15), list Approved Chats, update them (FR-03) and Revoke them (FR-04).
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { FileUploadIcon } from '../components/icons';
import pageStyles from './Page.module.css';
import styles from './ChatsPage.module.css';

type Chat = { id: string; name: string; colour: number; lookBackDays: number; approvedAt: string; lastUploadAt: string };
type Approved = { chat: Chat; messagesRead: number; detectedEvents: number };
type DateOrder = 'DMY' | 'MDY';

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

const ACCEPT = '.txt,.zip,text/plain,application/zip';
const messagesText = (n: number) => (n === 1 ? '1 message' : `${n} messages`);

const reasonOf = (err: unknown) =>
  err instanceof ApiError && err.body.message ? err.body.message : 'Kalender could not reach the server. Check your connection and try again.';

type Step =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'confirm'; file: File; nameFromFile: string | null; askOrder: boolean }
  | { kind: 'approving'; file: File; nameFromFile: string | null; askOrder: boolean };

export function ChatsPage() {
  const [chats, setChats] = useState<Chat[] | 'error' | undefined>();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [problem, setProblem] = useState<string>();
  const [fieldError, setFieldError] = useState<string>();
  const [done, setDone] = useState<Approved>();
  const [notice, setNotice] = useState<string>();
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // A revoked Chat's row disappears, so focus moves to the notice at the top (and the page scrolls to it).
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  useEffect(() => {
    api<Chat[]>('/chats').then(setChats, () => setChats('error'));
  }, []);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // the same file can be picked again after a refusal
    if (!file) return;
    setProblem(undefined);
    setDone(undefined);
    setNotice(undefined);
    if (file.size > MAX_BYTES) {
      setProblem('This file is over 4 MB. Export the Chat again without media.');
      return;
    }
    setStep({ kind: 'checking' });
    const preview = (dateOrder?: DateOrder) => {
      const body = new FormData();
      if (dateOrder) body.append('dateOrder', dateOrder);
      body.append('file', file);
      return api<{ chatNameFromFile: string | null }>('/chats/preview', { method: 'POST', body });
    };
    try {
      setStep({ kind: 'confirm', file, nameFromFile: (await preview()).chatNameFromFile, askOrder: false });
    } catch (err) {
      // AC-02.4: every date fits both orders, so the User chooses before anything is read. Either order gives the name.
      let reason = err;
      if (err instanceof ApiError && err.body.error === 'NEEDS_DATE_ORDER') {
        try {
          setStep({ kind: 'confirm', file, nameFromFile: (await preview('DMY')).chatNameFromFile, askOrder: true });
          return;
        } catch (again) {
          reason = again;
        }
      }
      setProblem(reasonOf(reason));
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
    if (step.askOrder) body.append('dateOrder', String(form.get('dateOrder')));
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

      {notice && (
        <p className={styles.done} role="status" tabIndex={-1} ref={noticeRef}>
          {notice}
        </p>
      )}

      {done && (
        <p className={styles.done} role="status">
          <strong>{done.chat.name}</strong> approved.{' '}
          {done.messagesRead === 0
            ? `No messages from the last ${done.chat.lookBackDays === 1 ? 'day' : `${done.chat.lookBackDays} days`}, so nothing was read.`
            : `${messagesText(done.messagesRead)} read.`}
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
          {step.askOrder && (
            <fieldset className={styles.field}>
              <legend>How does your phone write dates?</legend>
              <div className={styles.orders}>
                <label className={styles.segment}>
                  <input type="radio" name="dateOrder" value="DMY" defaultChecked />
                  <span>Day/month (05/10 is 5 Oct)</span>
                </label>
                <label className={styles.segment}>
                  <input type="radio" name="dateOrder" value="MDY" />
                  <span>Month/day (05/10 is 10 May)</span>
                </label>
              </div>
              <p className={styles.hint}>Every date in this file could be read either way. Updates of this Chat use the same order.</p>
            </fieldset>
          )}
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
            <li>Android: tap the menu, then More, then Export chat. iPhone: tap the Chat name, then Export Chat.</li>
            <li>Choose Without media and save the file.</li>
            <li>Choose that file here.</li>
          </ol>
          {problem && (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          )}
          <input ref={input} id="export-file" className={styles.fileInput} type="file" accept={ACCEPT} onChange={pick} />
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
              <ChatRow
                key={chat.id}
                chat={chat}
                onUpdated={(result) =>
                  setChats((list) => (Array.isArray(list) ? list.map((c) => (c.id === chat.id ? result.chat : c)) : list))
                }
                onRevoked={() => {
                  setChats((list) => (Array.isArray(list) ? list.filter((c) => c.id !== chat.id) : list));
                  setDone(undefined);
                  setNotice(`${chat.name} revoked. Approve it again to read new messages.`);
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/** One Approved Chat with Update (FR-03) and a two-step Revoke (FR-04). */
function ChatRow({ chat, onUpdated, onRevoked }: { chat: Chat; onUpdated: (result: Approved) => void; onRevoked: () => void }) {
  const [busy, setBusy] = useState<'update' | 'revoke'>();
  const [revoking, setRevoking] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [result, setResult] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  async function update(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setProblem(undefined);
    setResult(undefined);
    if (file.size > MAX_BYTES) {
      setProblem('This file is over 4 MB. Export the Chat again without media.');
      return;
    }
    setBusy('update');
    const body = new FormData();
    body.append('file', file);
    try {
      const updated = await api<Approved>(`/chats/${chat.id}/uploads`, { method: 'POST', body });
      setResult(updated.messagesRead === 0 ? 'Updated. No new messages since the last upload.' : `Updated. ${messagesText(updated.messagesRead)} read.`);
      onUpdated(updated);
    } catch (err) {
      setProblem(reasonOf(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function revoke() {
    setBusy('revoke');
    setProblem(undefined);
    try {
      await api(`/chats/${chat.id}`, { method: 'DELETE' });
      onRevoked();
    } catch (err) {
      setProblem(reasonOf(err));
      setBusy(undefined);
    }
  }

  const titleId = `chat-${chat.id}`;
  return (
    <li style={{ borderLeftColor: `var(--chat-${chat.colour})` }} aria-labelledby={titleId}>
      <span id={titleId} className={styles.chatName}>
        {chat.name}
      </span>
      <span className={styles.meta}>Approved {when.format(new Date(chat.approvedAt))}</span>
      <span className={styles.meta}>Last upload {when.format(new Date(chat.lastUploadAt))}</span>
      {result && (
        <p className={styles.rowResult} role="status">
          {result}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {revoking ? (
        <div className={styles.confirm} role="group" aria-labelledby={`${titleId}-revoke`}>
          <p id={`${titleId}-revoke`} className={styles.question}>
            Revoke {chat.name}? Its Detected Events and their message text are deleted. Confirmed Events stay.
          </p>
          <div className={styles.rowActions}>
            <button type="button" className={styles.yes} disabled={Boolean(busy)} onClick={revoke}>
              {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
            </button>
            <button type="button" className={pageStyles.secondary} disabled={Boolean(busy)} onClick={() => setRevoking(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.rowActions}>
          <input ref={input} className={styles.fileInput} type="file" accept={ACCEPT} onChange={update} aria-label={`Newer export of ${chat.name}`} />
          <button type="button" className={pageStyles.secondary} disabled={Boolean(busy)} onClick={() => input.current?.click()}>
            {busy === 'update' ? 'Reading…' : 'Update'}
          </button>
          <button type="button" className={styles.revoke} disabled={Boolean(busy)} onClick={() => setRevoking(true)}>
            Revoke
          </button>
        </div>
      )}
    </li>
  );
}
