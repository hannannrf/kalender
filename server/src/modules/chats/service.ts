// Approve, update, list and Revoke Chats (FR-02, FR-03, FR-04, BR-02, BR-06, BR-15). File bytes live only in this call's memory (BR-05).
import type { Pool } from 'pg';
import { parseExport, selectEligible, type DateOrder } from '../ingestion';
import * as events from '../events';
import { withTransaction } from '../../shared/db';
import { startOfMinute } from '../../shared/time';
import * as repo from './repository';

export const LOOK_BACK_DAYS = [1, 3, 7] as const;
export type Upload = { bytes: Uint8Array; filename: string };

export type Refusal = {
  refused: 'NOT_AN_EXPORT' | 'NEEDS_DATE_ORDER' | 'DATE_ORDER_MISMATCH' | 'DUPLICATE_CHAT' | 'WRONG_CHAT' | 'CHAT_NOT_APPROVED';
  message: string;
};

export type ChatView = { id: string; name: string; colour: number; lookBackDays: number; approvedAt: string; lastUploadAt: string };

const view = (row: repo.ChatRow): ChatView => ({
  id: row.id,
  name: row.name,
  colour: row.colour,
  lookBackDays: row.look_back_days,
  approvedAt: row.approved_at.toISOString(),
  lastUploadAt: row.last_upload_at.toISOString(),
});

const needsDateOrder: Refusal = {
  refused: 'NEEDS_DATE_ORDER',
  message: 'Every date in this file could be day/month or month/day, so Kalender needs to know which order your phone uses.',
};

/** Reads the file and stores nothing (architecture section 6.3, Q-4). */
export function previewExport(upload: Upload, dateOrder?: DateOrder): { chatNameFromFile: string | null } | Refusal {
  const parsed = parseExport(upload.bytes, upload.filename, dateOrder);
  if (parsed.kind === 'rejected') return { refused: parsed.code, message: parsed.reason };
  if (parsed.kind === 'needs-date-order') return needsDateOrder;
  return { chatNameFromFile: parsed.nameFromFile };
}

export type Approved = { chat: ChatView; messagesRead: number; detectedEvents: number; noNewMessages: boolean };

export async function approveChat(
  db: Pool,
  userId: string,
  upload: Upload,
  options: { confirmedName: string; lookBackDays: number; dateOrder?: DateOrder },
  now: Date,
): Promise<Approved | Refusal> {
  const parsed = parseExport(upload.bytes, upload.filename, options.dateOrder);
  if (parsed.kind === 'rejected') return { refused: parsed.code, message: parsed.reason };
  if (parsed.kind === 'needs-date-order') return needsDateOrder;

  const startPoint = startOfMinute(new Date(now.getTime() - options.lookBackDays * 24 * 60 * 60 * 1000));
  const selection = selectEligible(parsed.messages, { startPoint, readUpTo: null, boundary: {} });

  // One transaction: the pointers move only if the Detected Events are stored too (architecture section 6.3).
  return withTransaction(db, async (tx) => {
    const row = await repo.insertApproved(tx, userId, {
      name: options.confirmedName,
      nameKey: parsed.fileKey,
      lookBackDays: options.lookBackDays,
      dateOrder: parsed.dateOrder,
      approvedAt: now,
      startPoint,
      readUpTo: selection.readUpTo,
      boundary: selection.boundary,
    });
    if (!row) return { refused: 'DUPLICATE_CHAT', message: 'This Chat is already approved.' } as const;

    const detectedEvents = await events.ingestMessages(userId, { id: row.id, name: row.name, colour: row.colour }, selection.eligible, tx, now);
    const messagesRead = selection.eligible.length;
    return { chat: view(row), messagesRead, detectedEvents, noNewMessages: messagesRead === 0 };
  });
}

/**
 * FR-03: reads a newer export of an Approved Chat. Only messages after the Read-up-to Point, plus unread ones in its minute,
 * are read (BR-02). The pointers move in the same transaction that stores the Detected Events. Undefined if not this User's Chat.
 */
export async function updateChat(db: Pool, userId: string, chatId: string, upload: Upload, now: Date): Promise<Approved | Refusal | undefined> {
  return withTransaction(db, async (tx) => {
    const row = await repo.getForUpload(tx, userId, chatId);
    if (!row) return undefined;
    if (row.revoked_at) {
      return { refused: 'CHAT_NOT_APPROVED', message: 'This Chat was revoked. Approve it again to read its messages.' } as const;
    }
    const parsed = parseExport(upload.bytes, upload.filename, row.date_order); // R2-6: the order stored at approval
    if (parsed.kind === 'rejected') return { refused: parsed.code, message: parsed.reason };
    if (parsed.kind === 'needs-date-order') return needsDateOrder; // not reached: an order is always passed
    if (parsed.fileKey !== row.name_key) {
      return { refused: 'WRONG_CHAT', message: `This export is of another Chat. Upload the export of ${row.name}.` } as const;
    }

    const selection = selectEligible(parsed.messages, { startPoint: row.start_point, readUpTo: row.read_up_to, boundary: row.boundary });
    const detectedEvents = await events.ingestMessages(userId, { id: row.id, name: row.name, colour: row.colour }, selection.eligible, tx, now);
    const saved = await repo.saveUpload(tx, userId, row.id, { readUpTo: selection.readUpTo, boundary: selection.boundary, at: now });
    const messagesRead = selection.eligible.length;
    return { chat: view(saved), messagesRead, detectedEvents, noNewMessages: messagesRead === 0 };
  });
}

/** FR-04, BR-06: one transaction. False if not this User's Chat or already revoked. */
export async function revokeChat(db: Pool, userId: string, chatId: string, now: Date): Promise<boolean> {
  return withTransaction(db, async (tx) => {
    const row = await repo.getForUpload(tx, userId, chatId);
    if (!row || row.revoked_at) return false;
    await events.deleteUnconfirmedForChat(tx, userId, row.id);
    return repo.revoke(tx, userId, row.id, now);
  });
}

export async function listChats(db: Pool, userId: string): Promise<ChatView[]> {
  return (await repo.listActive(db, userId)).map(view);
}
