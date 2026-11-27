// Public entry of the calendar-sync module (architecture section 6.1). It may use only jobs (AGENTS.md section 4).
export { router } from './routes';
export { getLinkStatus, getStatuses, register, retryNow, unlink, type LinkStatus } from './service';
// AC-13.3: called only by identity's account deletion, in its own transaction (architecture 6.3).
export { deleteAllForUser } from './service';
