// Detected Events (FR-05) and Source Message lifetime (BR-05). Review, confirm and dismiss come in S04.
import { detect, type DetectedEventDraft } from '../detection';
import type { Db } from '../../shared/db';
import { pktToUtc } from '../../shared/time';
import * as repo from './repository';

export type ChatRef = { id: string; name: string; colour: number };
export type IncomingMessage = { sentAt: Date; sender: string; text: string };

const DAY_MS = 24 * 60 * 60 * 1000;

/** R2-2 and BR-05: a draft already over at upload time is not stored. */
function stillUpcoming(d: DetectedEventDraft, sentAt: Date, now: Date): boolean {
  if (d.date === null) return sentAt.getTime() + 7 * DAY_MS > now.getTime(); // Needs date lives 7 days from sending
  const [y, m, day] = d.date.split('-').map(Number);
  if (d.time === null) return pktToUtc(y, m, day + 1, 0, 0) > now; // All-day lasts to the end of its date (BR-14)
  const [h, min] = d.time.split(':').map(Number);
  return pktToUtc(y, m, day, h, min) > now;
}

/**
 * Detects Events in messages read from an upload and stores them with their Source Message.
 * Runs inside the caller's transaction. A message with no upcoming Event is not stored (BR-05, AC-05.4).
 * Returns how many Detected Events were stored.
 */
export async function ingestMessages(userId: string, chat: ChatRef, messages: IncomingMessage[], tx: Db, now: Date): Promise<number> {
  let stored = 0;
  for (const message of messages) {
    const drafts = detect(message.text, message.sentAt).filter((d) => stillUpcoming(d, message.sentAt, now));
    if (drafts.length === 0) continue;
    const sourceMessageId = await repo.insertSourceMessage(tx, userId, { chatId: chat.id, ...message });
    for (const d of drafts) {
      await repo.insertDetected(tx, userId, {
        chatId: chat.id,
        chatName: chat.name,
        chatColour: chat.colour,
        sourceMessageId,
        title: d.title,
        date: d.date,
        time: d.time,
        place: d.place,
        uncertain: d.uncertain,
        rules: d.rules,
      });
      stored++;
    }
  }
  return stored;
}

export type DetectedEventView = {
  id: string;
  chat: ChatRef;
  title: string;
  date: string | null;
  time: string | null;
  place: string | null;
  uncertain: string[];
  rules: string[];
};

export async function listDetected(db: Db, userId: string): Promise<DetectedEventView[]> {
  return (await repo.listDetected(db, userId)).map((r) => ({
    id: r.id,
    chat: { id: r.chat_id, name: r.chat_name, colour: r.chat_colour },
    title: r.title,
    date: r.date,
    time: r.time,
    place: r.place,
    uncertain: r.uncertain,
    rules: r.rules,
  }));
}
