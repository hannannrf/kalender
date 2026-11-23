import { NavLink } from 'react-router-dom';
import { CalendarIcon, ChatsIcon, InboxIcon, SettingsIcon } from './icons';
import styles from './BottomNav.module.css';

const tabs = [
  { to: '/', label: 'Inbox', icon: <InboxIcon /> },
  { to: '/events', label: 'Events', icon: <CalendarIcon /> },
  { to: '/chats', label: 'Chats', icon: <ChatsIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
];

export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => (isActive ? `${styles.tab} ${styles.active}` : styles.tab)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
