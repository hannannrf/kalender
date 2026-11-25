// Public entry of the reminders module (architecture section 6.1).
export { router } from './routes';
export {
  getReminderStates,
  getSettings,
  listInApp,
  markSeen,
  register,
  reminderTime,
  setDefaultLeadTime,
  setEventReminder,
  type NotificationView,
  type ReminderState,
} from './service';
// AC-13.3: called only by identity's account deletion, in its own transaction (architecture 6.3).
export { deleteAllForUser } from './repository';
