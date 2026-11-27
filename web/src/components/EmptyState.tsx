import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export function EmptyState({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.empty}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
