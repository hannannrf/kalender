import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

type Account = { email: string };
type State = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; account: Account } | { status: 'offline' };

type Session = State & {
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
      await api('/auth/sign-out', { method: 'POST' });
      setState({ status: 'signed-out' });
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
