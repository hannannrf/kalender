import express, { type ErrorRequestHandler } from 'express';
import * as chats from './modules/chats';
import * as events from './modules/events';
import * as identity from './modules/identity';
import { DatabaseNotConfigured, getPool } from './shared/db';
import { logError } from './shared/log';

// Composition root (AGENTS.md section 3): mounts module routers. No business logic here.
export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    res.json({ status: 'ok', db: 'not_configured' });
    return;
  }
  try {
    await pool.query('select 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    // Never return connection details (they can contain credentials).
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});

app.use('/api', identity.publicRouter);
app.use('/api', identity.requireUser());
app.use('/api', identity.router);
app.use('/api', chats.router);
app.use('/api', events.router);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const onError: ErrorRequestHandler = (err, req, res, _next) => {
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_json' });
    return;
  }
  if (err instanceof DatabaseNotConfigured) {
    res.status(503).json({ error: 'database_not_configured' });
    return;
  }
  logError(`${req.method} ${req.route?.path ?? 'unknown route'}`, err);
  res.status(500).json({ error: 'internal' });
};
app.use(onError);
