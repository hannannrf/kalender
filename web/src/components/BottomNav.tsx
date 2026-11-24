import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../api';
import { CalendarIcon, ChatsIcon, InboxIcon, SettingsIcon } from './icons';
import styles from './BottomNav.module.css';

const tabs = [
  { to: '/', label: 'Inbox', icon: <InboxIcon /> },
  { to: '/events', label: 'Events', icon: <CalendarIcon /> },
  { to: '/chats', label: 'Chats', icon: <ChatsIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

/** How many Detected Events wait in the Inbox, refreshed on every screen change. */
function useInboxCount() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    api<unknown[]>('/detected-events').then((list) => setCount(list.length), () => setCount(0));
  }, [pathname]);
  return count;
}

export function BottomNav() {
  const inbox = useInboxCount();
  return (
    <nav className={styles.nav} aria-label="Main">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          <span className={styles.icon}>
            {tab.icon}
            {tab.to === '/' && inbox > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {inbox > 99 ? '99+' : inbox}
              </span>
            )}
          </span>
          <span>{tab.label}</span>
          {tab.to === '/' && inbox > 0 && <span className={styles.srOnly}>, {inbox} to check</span>}
        </NavLink>
      ))}
    </nav>
  );
}
