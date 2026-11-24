// Public entry of the events module (architecture section 6.1).
export { router } from './routes';
export {
  confirm,
  dismiss,
  getDetected,
  ingestMessages,
  listDetected,
  listUpcoming,
  review,
  type ChatRef,
  type ConfirmedEventView,
  type DetectedEventDetail,
  type DetectedEventView,
  type IncomingMessage,
} from './service';
