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
