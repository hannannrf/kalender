import { Router, type Request, type Response } from 'express';
import * as calendarSync from '../calendar-sync';
import * as jobs from '../jobs';
import * as reminders from '../reminders';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import { logError } from '../../shared/log';
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

/** Q-11: hand the new outbox messages to their subscribers before responding (2 s, 5 messages). Never changes the response. */
async function dispatchNow(): Promise<void> {
  try {
    await jobs.dispatchOutbox(db(), new Date(), { limit: 5, timeBudgetMs: 2000 });
  } catch (err) {
    logError('events.dispatchNow', err);
  }
}

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

async function confirmDetected(req: Request, res: Response, id: string) {
  const result = await service.confirm(db(), userIdOf(req), id, new Date());
  if (!result) notFound(res);
  else if ('refused' in result) res.status(422).json({ error: result.refused, message: result.message, fields: result.fields });
  else {
    await dispatchNow();
    res.status(201).json(result);
  }
}

async function dismissDetected(req: Request, res: Response, id: string) {
  if (await service.dismiss(db(), userIdOf(req), id)) res.status(204).end();
  else notFound(res);
}

router.post('/detected-events/:id/confirm', async (req, res) => {
  const id = idOf(req, res);
  if (id) await confirmDetected(req, res, id);
});

router.post('/detected-events/:id/dismiss', async (req, res) => {
  const id = idOf(req, res);
  if (id) await dismissDetected(req, res, id);
});

/** FR-06, BR-04: the Possible Duplicate choice. Add and dismiss are Confirm and Dismiss; update names the Event the User saw. */
router.post('/detected-events/:id/duplicate', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const { choice, existingId } = req.body ?? {};
  if (choice === 'add') return confirmDetected(req, res, id);
  if (choice === 'dismiss') return dismissDetected(req, res, id);
  if (choice !== 'update' || typeof existingId !== 'string') {
    res.status(400).json({ error: 'invalid', fields: { choice: 'Choose add, update or dismiss. Update needs existingId.' } });
    return;
  }
  const result = await service.updateExisting(db(), userIdOf(req), id, existingId, new Date());
  if (!result) notFound(res);
  else if ('refused' in result) res.status(422).json({ error: result.refused, message: result.message, fields: result.fields });
  else {
    await dispatchNow();
    res.json(result);
  }
});

router.get('/events', async (req, res) => {
  const userId = userIdOf(req);
  const events = await service.listUpcoming(db(), userId, new Date());
  // Read-model exception (architecture 6.1): the "Calendar update failed" mark (GL-22).
  const failed = await calendarSync.getStatuses(db(), userId, events.map((e) => e.id));
  res.json(events.map((e) => ({ ...e, calendarFailed: e.id in failed })));
});

type Answer = (service.ConfirmedEventView & { reminder?: reminders.ReminderState | null; calendarFailed?: boolean }) | service.Invalid | service.PastRefusal | undefined;

/** Answers a create, read or edit; a successful change is dispatched first. */
async function answer(res: Response, result: Answer, status = 200, changed = true) {
  if (!result) notFound(res);
  else if ('invalid' in result) res.status(400).json({ error: 'invalid', fields: result.invalid });
  else if ('refused' in result) res.status(422).json({ error: result.refused, message: result.message, fields: result.fields });
  else {
    if (changed) await dispatchNow();
    res.status(status).json(result);
  }
}

router.post('/events', async (req, res) => {
  await answer(res, await service.createManual(db(), userIdOf(req), req.body ?? {}, new Date()), 201);
});

router.get('/events/:id', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  const userId = userIdOf(req);
  const event = await service.getConfirmed(db(), userId, id);
  // Read-model exception (architecture 6.1): the Reminder state shown on the edit form.
  const reminder = event && ((await reminders.getReminderStates(db(), userId, [id]))[id] ?? null);
  const calendarFailed = Boolean(event && (await calendarSync.getStatuses(db(), userId, [id]))[id]);
  await answer(res, event && { ...event, reminder, calendarFailed }, 200, false);
});

router.patch('/events/:id', async (req, res) => {
  const id = idOf(req, res);
  if (id) await answer(res, await service.editConfirmed(db(), userIdOf(req), id, req.body ?? {}, new Date()));
});

router.delete('/events/:id', async (req, res) => {
  const id = idOf(req, res);
  if (!id) return;
  if (await service.deleteConfirmed(db(), userIdOf(req), id)) {
    await dispatchNow();
    res.status(204).end();
  } else notFound(res);
});
