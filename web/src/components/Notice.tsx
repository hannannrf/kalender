// A short notice after Confirm or Dismiss (S14-4). The message comes in the router state and is shown once.
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './Notice.module.css';

export function Notice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [text, setText] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);

  useEffect(() => {
    if (!text) return;
    navigate(location.pathname, { replace: true, state: null }); // shown once: Back or reload does not show it again (runs on mount only)
    const timer = setTimeout(() => setText(null), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <p role="status" className={text ? styles.notice : 'sr-only'}>
      {text}
    </p>
  );
}
