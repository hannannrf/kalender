// Public entry of the events module (architecture section 6.1).
export { router } from './routes';
export {
  confirm,
  createManual,
  deleteConfirmed,
  deleteUnconfirmedForChat,
  dismiss,
  editConfirmed,
  getConfirmed,
  getDetected,
  ingestMessages,
  listDetected,
  listUpcoming,
  register,
  review,
  type ChatRef,
  type ConfirmedEventView,
  type DetectedEventDetail,
  type DetectedEventView,
  type IncomingMessage,
} from './service';
// AC-13.3: called only by identity's account deletion, in its own transaction (architecture 6.3).
export { deleteAllForUser } from './repository';
