// Grey placeholder cards while a list loads (S14-3). Screen readers hear the label instead.
import styles from './Placeholder.module.css';

export function Placeholder({ label, cards = 3 }: { label: string; cards?: number }) {
  return (
    <div role="status" className={styles.list}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className={styles.card} aria-hidden="true">
          <span className={styles.line} />
          <span className={`${styles.line} ${styles.short}`} />
        </div>
      ))}
    </div>
  );
}
