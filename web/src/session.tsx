import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { forgetThisPhone } from './push';

type Account = { email: string };
type State = { status: 'loading' } | { status: 'signed-out'; notice?: string } | { status: 'signed-in'; account: Account } | { status: 'offline' };

type Session = State & {
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** FR-13: throws ApiError 403 with fields.password when the password is wrong. */
  deleteAccount: (password: string) => Promise<void>;
  retry: () => void;
};

const SessionContext = createContext<Session | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    api<Account>('/me')
      .then((account) => setState({ status: 'signed-in', account }))
      .catch((err) => setState(err instanceof ApiError && err.status === 401 ? { status: 'signed-out' } : { status: 'offline' }));
  }, []);

  useEffect(load, [load]);

  const enter = (path: string) => async (email: string, password: string) => {
    const account = await api<Account>(path, { method: 'POST', body: { email, password } });
    setState({ status: 'signed-in', account });
  };

  const value: Session = {
    ...state,
    signIn: enter('/auth/sign-in'),
    register: enter('/auth/register'),
    signOut: async () => {
      await forgetThisPhone(); // S10 decision 4: a shared phone stops getting this User's Reminders
      await api('/auth/sign-out', { method: 'POST' });
      setState({ status: 'signed-out' });
    },
    deleteAccount: async (password) => {
      await api('/account', { method: 'DELETE', body: { password } });
      await forgetThisPhone();
      setState({ status: 'signed-out', notice: 'Your account and everything in it are deleted.' });
    },
    retry: load,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
}
