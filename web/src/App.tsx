import { Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ChatsPage, EventsPage, InboxPage, SettingsPage } from './pages/Pages';

export function App() {
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
