import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { EmptyState } from './components/EmptyState';
import { AuthPage } from './pages/AuthPage';
import { ChatsPage, EventsPage, InboxPage, SettingsPage } from './pages/Pages';
import pageStyles from './pages/Page.module.css';
import { useSession } from './session';

export function App() {
  const session = useSession();

  if (session.status === 'loading') return null;

  if (session.status === 'offline') {
    return (
      <main className={pageStyles.page}>
        <EmptyState title="Kalender is not reachable">
          Check your connection.{' '}
          <button type="button" className={pageStyles.textButton} onClick={session.retry}>
            Try again
          </button>
        </EmptyState>
      </main>
    );
  }

  if (session.status === 'signed-out') {
    return (
      <Routes>
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/create-account" element={<AuthPage mode="create" />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<InboxPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}
