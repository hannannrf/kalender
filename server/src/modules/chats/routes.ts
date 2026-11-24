import { Router, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { db } from '../../shared/db';
import { userIdOf } from '../../shared/http';
import type { DateOrder } from '../ingestion';
import * as service from './service';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // architecture section 6.2; the PWA checks the same limit first

const multipart = multer({
  storage: multer.memoryStorage(), // never disk (AGENTS.md section 5)
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
  defParamCharset: 'utf8', // Chat names in file names often have emoji or Urdu
}).single('file');

const receiveFile: RequestHandler = (req, res, next) => {
  multipart(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'TOO_LARGE', message: 'This file is over 4 MB. Export the Chat again without media.' });
      return;
    }
    if (err) {
      res.status(400).json({ error: 'bad_upload' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'invalid', fields: { file: 'Choose the exported Chat file.' } });
      return;
    }
    next();
  });
};

const STATUS: Record<service.Refusal['refused'], number> = {
  NOT_AN_EXPORT: 422,
  NEEDS_DATE_ORDER: 422,
  DATE_ORDER_MISMATCH: 422,
  DUPLICATE_CHAT: 409,
  WRONG_CHAT: 422,
  CHAT_NOT_APPROVED: 422,
};

function refuse(res: Response, refusal: service.Refusal) {
  res.status(STATUS[refusal.refused]).json({ error: refusal.refused, message: refusal.message });
}

const dateOrderOf = (value: unknown): DateOrder | undefined => (value === 'DMY' || value === 'MDY' ? value : undefined);

export const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (res: Response) => res.status(404).json({ error: 'not_found' });

router.get('/chats', async (req, res) => {
  res.json(await service.listChats(db(), userIdOf(req)));
});

router.post('/chats/preview', receiveFile, (req, res) => {
  const file = req.file!;
  const result = service.previewExport({ bytes: file.buffer, filename: file.originalname }, dateOrderOf(req.body?.dateOrder));
  if ('refused' in result) refuse(res, result);
  else res.json(result);
});

router.post('/chats', receiveFile, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const lookBackDays = req.body?.lookBackDays === undefined ? 7 : Number(req.body.lookBackDays);
  const fields: Record<string, string> = {};
  if (!name || name.length > 100) fields.name = 'Enter the Chat name (up to 100 characters).';
  if (!(service.LOOK_BACK_DAYS as readonly number[]).includes(lookBackDays)) fields.lookBackDays = 'Choose 1, 3 or 7 days.';
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'invalid', fields });
    return;
  }
  const file = req.file!;
  const result = await service.approveChat(
    db(),
    userIdOf(req),
    { bytes: file.buffer, filename: file.originalname },
    { confirmedName: name, lookBackDays, dateOrder: dateOrderOf(req.body?.dateOrder) },
    new Date(),
  );
  if ('refused' in result) refuse(res, result);
  else res.status(201).json(result);
});

// FR-03: unknown, malformed or another User's id all answer 404 (BR-11).
router.post('/chats/:id/uploads', receiveFile, async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return void notFound(res);
  const file = req.file!;
  const result = await service.updateChat(db(), userIdOf(req), id, { bytes: file.buffer, filename: file.originalname }, new Date());
  if (!result) notFound(res);
  else if ('refused' in result) refuse(res, result);
  else res.json(result);
});

// FR-04: Revoke.
router.delete('/chats/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!UUID.test(id)) return void notFound(res);
  if (await service.revokeChat(db(), userIdOf(req), id, new Date())) res.status(204).end();
  else notFound(res);
});
