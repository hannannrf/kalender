import express from 'express';
import { getPool } from './shared/db';

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

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});
