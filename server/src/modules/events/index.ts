// Public entry of the events module (architecture section 6.1).
export { router } from './routes';
export { ingestMessages, listDetected, type ChatRef, type DetectedEventView, type IncomingMessage } from './service';
