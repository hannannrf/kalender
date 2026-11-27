import { Router, type Request } from 'express';
import * as jobs from '../jobs';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import { logError } from '../../shared/log';
import * as service from './service';

export const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** S11 decision 7: built from the request's own host, so local, preview and production each use their own callback. */
const redirectUri = (req: Request) => `${(req.get('x-forwarded-proto') ?? req.protocol).split(',')[0]}://${req.get('host')}/api/calendar/callback`;

/** BR-18: dispatch CalendarLinked, then the EventResync messages it makes, so the copies are added before Settings opens. Never changes the answer. */
async function addCopiesNow(): Promise<void> {
  try {
    for (const limit of [5, 50]) await jobs.dispatchOutbox(db(), new Date(), { limit, timeBudgetMs: 4000 });
  } catch (err) {
    logError('calendar-sync.addCopiesNow', err);
  }
}

router.get('/calendar', async (req, res) => {
  res.json({ status: await service.getLinkStatus(db(), userIdOf(req)) });
});

router.post('/calendar/link', (req, res) => {
  const url = service.startLink(userIdOf(req), redirectUri(req), new Date());
  if (url) res.json({ url });
  else res.status(404).json({ error: 'calendar_not_configured' });
});

/** Google sends the browser here after consent. The answer is always a redirect to Settings with the outcome. */
router.get('/calendar/callback', async (req, res) => {
  const result = await service.completeLink(db(), userIdOf(req), req.query as Record<string, unknown>, redirectUri(req), new Date());
  if (result === 'linked') await addCopiesNow();
  res.redirect(303, `/settings?calendar=${result}`);
});

router.delete('/calendar', async (req, res) => {
  await service.unlink(db(), userIdOf(req));
  res.status(204).end();
});

router.post('/calendar/retry/:eventId', async (req, res) => {
  const eventId = String(req.params.eventId);
  const status = UUID.test(eventId) ? await service.retryNow(db(), userIdOf(req), eventId, new Date()) : undefined;
  if (status) res.json({ calendar: status });
  else res.status(404).json({ error: 'not_found' });
});
