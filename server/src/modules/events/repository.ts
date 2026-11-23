// The only code that touches source_messages and detected_events (ADR-005). Every function takes userId first.
import type { Db } from '../../shared/db';

export type NewSourceMessage = { chatId: string; sender: string; text: string; sentAt: Date };

export async function insertSourceMessage(db: Db, userId: string, m: NewSourceMessage): Promise<string> {
  const res = await db.query<{ id: string }>(
    'insert into source_messages (user_id, chat_id, sender, text, sent_at) values ($1, $2, $3, $4, $5) returning id',
    [userId, m.chatId, m.sender, m.text, m.sentAt],
  );
  return res.rows[0].id;
}

export type NewDetected = {
  chatId: string;
  chatName: string;
  chatColour: number;
  sourceMessageId: string;
  title: string;
  date: string | null;
  time: string | null;
  place: string | null;
  uncertain: string[];
  rules: string[];
};

export async function insertDetected(db: Db, userId: string, e: NewDetected): Promise<void> {
  await db.query(
    `insert into detected_events
       (user_id, chat_id, chat_name, chat_colour, source_message_id, title, date, time, place, uncertain, rules)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [userId, e.chatId, e.chatName, e.chatColour, e.sourceMessageId, e.title, e.date, e.time, e.place, e.uncertain, e.rules],
  );
}

export type DetectedRow = {
  id: string;
  chat_id: string;
  chat_name: string;
  chat_colour: number;
  title: string;
  date: string | null;
  time: string | null;
  place: string | null;
  uncertain: string[];
  rules: string[];
};

/** Dates and times as text, so no server time zone can shift them. Dated first by date and time, then "Needs date". */
export async function listDetected(db: Db, userId: string): Promise<DetectedRow[]> {
  const res = await db.query<DetectedRow>(
    `select id, chat_id, chat_name, chat_colour, title,
            to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI') as time, place, uncertain, rules
       from detected_events where user_id = $1
      order by date asc nulls last, time asc nulls first, created_at asc`,
    [userId],
  );
  return res.rows;
}
