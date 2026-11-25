// Public entry of the identity module (AGENTS.md section 3). Only the composition root imports it.
export { publicRouter, requireUser, router } from './routes';
export { register } from './service';
