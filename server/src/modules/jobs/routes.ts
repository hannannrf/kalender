import { Router } from 'express';
import { db } from '../../shared/db';
import { tick, tickSecretMatches } from './service';

// POST /internal/tick (ADR-002): called every minute by cron-job.org. The only route outside /api.
// A missing or wrong secret looks like an unknown route (404), so the endpoint cannot be probed.
export const tickRouter = Router();

tickRouter.post('/internal/tick', async (req, res) => {
  if (!tickSecretMatches(req.get('authorization'), process.env.TICK_SECRET)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(await tick(db(), new Date()));
});
