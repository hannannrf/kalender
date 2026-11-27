// A Chat's initials on its Chat colour (S15). Decorative: the Chat name is always written next to it.
import type { CSSProperties } from 'react';
import styles from './ChatAvatar.module.css';

/** The CSS colour of a Chat, or the Manual grey for a Manual Event (colour null). */
export const chatColour = (colour: number | null) => (colour ? `var(--chat-${colour})` : 'var(--chat-manual)');

/** Sets --c, which the tinted Chat cards read. */
export const chatStyle = (colour: number | null) => ({ '--c': chatColour(colour) }) as CSSProperties;

export function initials(name: string) {
  const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const first = words[0] ?? '';
  // "SE-3D Class" gives SE (a short code keeps its letters); "Project Team" gives PT.
  if (first.length >= 2 && first === first.toUpperCase() && /\p{L}/u.test(first)) return first.slice(0, 2);
  return (first.slice(0, 1) + (words[1]?.[0] ?? first[1] ?? '')).toUpperCase() || '?';
}

export function ChatAvatar({ name, colour, large = false }: { name: string; colour: number | null; large?: boolean }) {
  return (
    <span className={large ? `${styles.avatar} ${styles.large}` : styles.avatar} style={{ background: chatColour(colour) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
