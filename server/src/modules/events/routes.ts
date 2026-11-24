import { Router, type Request, type Response } from 'express';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import * as service from './service';

export const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id from the URL, or undefined after answering 404 (unknown, malformed or another User's id look the same, BR-11). */
function idOf(req: Request, res: Response): string | undefined {
  const id = String(req.params.id);
  if (UUID.test(id)) return id;
  notFound(res);
  return undefined;
}
const notFound = (res: Response) => res.status(404).json({ error: 'not_found' });

router.get('/detected-events', async (req, res) => {
  res.json(await service.listDetected(db(), userIdOf(req)));
});

router.get('/detected-events/:id', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const detail = await service.getDetected(db(), userIdOf(req), id);
  if (detail) res.json(detail);
  else notFound(res);
});

router.post('/detected-events/:id/review', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const result = await service.review(db(), userIdOf(req), id, req.body ?? {});
  if (!result) notFound(res);
  else if ('invalid' in result) res.status(400).json({ error: 'invalid', fields: result.invalid });
  else res.json(result);
});

router.post('/detected-events/:id/confirm', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const result = await service.confirm(db(), userIdOf(req), id, new Date());
  if (!result) notFound(res);
  else if ('refused' in result) res.status(422).json({ error: result.refused, message: result.message, fields: result.fields });
  else res.status(201).json(result);
});

router.post('/detected-events/:id/dismiss', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  if (await service.dismiss(db(), userIdOf(req), id)) res.status(204).end();
  else notFound(res);
});

router.get('/events', async (req, res) => {
  res.json(await service.listUpcoming(db(), userIdOf(req), new Date()));
});
