// Public entry of the jobs module (architecture section 6.1). jobs imports no feature module.
export { tickRouter } from './routes';
export {
  cancel,
  dispatchOutbox,
  enqueue,
  publish,
  registerHandler,
  registerTickTask,
  subscribe,
  tick,
  type Job,
  type Registry,
  type TickResult,
} from './service';
// AC-13.3: called only by identity's account deletion, in its own transaction (architecture 6.3).
export { deleteAllForUser } from './repository';
