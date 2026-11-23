// Approve and list Chats (FR-02, BR-02, BR-15). File bytes live only in this call's memory (BR-05).
import type { Pool } from 'pg';
import { parseExport, selectEligible, type DateOrder } from '../ingestion';
import * as events from '../events';
import { withTransaction } from '../../shared/db';
import { startOfMinute } from '../../shared/time';
import * as repo from './repository';

export const LOOK_BACK_DAYS = [1, 3, 7] as const;
export type Upload = { bytes: Uint8Array; filename: string };

export type Refusal = { refused: 'NOT_AN_EXPORT' | 'NEEDS_DATE_ORDER' | 'DATE_ORDER_MISMATCH' | 'DUPLICATE_CHAT'; message: string };

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

export async function listChats(db: Pool, userId: string): Promise<ChatView[]> {
  return (await repo.listActive(db, userId)).map(view);
}
