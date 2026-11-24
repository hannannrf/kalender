import { Router, type Request, type Response } from 'express';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import * as service from './service';

export const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (res: Response) => res.status(404).json({ error: 'not_found' });

/** The id from the URL, or undefined after answering 404 (unknown, malformed or another User's id look the same, BR-11). */
function idOf(req: Request, res: Response): string | undefined {
  const id = String(req.params.id);
  if (UUID.test(id)) return id;
  notFound(res);
  return undefined;
}

router.get('/settings/reminders', async (req, res) => {
  res.json(await service.getSettings(db(), userIdOf(req)));
});

router.put('/settings/reminders', async (req, res) => {
  const result = await service.setDefaultLeadTime(db(), userIdOf(req), req.body ?? {}, new Date());
  if ('invalid' in result) res.status(400).json({ error: 'invalid', fields: result.invalid });
  else res.json(result);
});

router.put('/events/:id/reminder', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const result = await service.setEventReminder(db(), userIdOf(req), id, req.body ?? {}, new Date());
  if (!result) notFound(res);
  else if ('invalid' in result) res.status(400).json({ error: 'invalid', fields: result.invalid });
  else res.json(result);
});

router.get('/notifications', async (req, res) => {
  res.json(await service.listInApp(db(), userIdOf(req), new Date()));
});

router.post('/notifications/:id/seen', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  if (await service.markSeen(db(), userIdOf(req), id, new Date())) res.status(204).end();
  else notFound(res);
});
