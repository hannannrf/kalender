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

export async function insertDetected(db: Db, userId: string, e: NewDetected): Promise<string> {
  const res = await db.query<{ id: string }>(
    `insert into detected_events
       (user_id, chat_id, chat_name, chat_colour, source_message_id, title, date, time, place, uncertain, rules)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning id`,
    [userId, e.chatId, e.chatName, e.chatColour, e.sourceMessageId, e.title, e.date, e.time, e.place, e.uncertain, e.rules],
  );
  return res.rows[0].id;
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

const DETECTED_COLUMNS = `d.id, d.chat_id, d.chat_name, d.chat_colour, d.title,
  to_char(d.date, 'YYYY-MM-DD') as date, to_char(d.time, 'HH24:MI') as time, d.place, d.uncertain, d.rules`;

export type DetectedWithMessage = DetectedRow & { source_message_id: string; sender: string; text: string; sent_at: Date };

/** One Detected Event with its Source Message. `lock` holds the row until the transaction ends (confirm, dismiss). */
export async function getDetected(db: Db, userId: string, id: string, lock = false): Promise<DetectedWithMessage | undefined> {
  const res = await db.query<DetectedWithMessage>(
    `select ${DETECTED_COLUMNS}, d.source_message_id, m.sender, m.text, m.sent_at
       from detected_events d join source_messages m on m.id = d.source_message_id
      where d.user_id = $1 and d.id = $2${lock ? ' for update of d' : ''}`,
    [userId, id],
  );
  return res.rows[0];
}

export type DetectedChange = { title: string; date: string | null; time: string | null; place: string | null; uncertain: string[] };

export async function updateDetected(db: Db, userId: string, id: string, c: DetectedChange): Promise<void> {
  await db.query(
    'update detected_events set title = $3, date = $4, time = $5, place = $6, uncertain = $7 where user_id = $1 and id = $2',
    [userId, id, c.title, c.date, c.time, c.place, c.uncertain],
  );
}

export async function deleteDetected(db: Db, userId: string, id: string): Promise<void> {
  await db.query('delete from detected_events where user_id = $1 and id = $2', [userId, id]);
}

/** BR-05, BR-17: a Source Message is deleted once no Detected Event comes from it. */
export async function deleteSourceMessageIfUnused(db: Db, userId: string, sourceMessageId: string): Promise<void> {
  await db.query(
    `delete from source_messages m where m.user_id = $1 and m.id = $2
       and not exists (select 1 from detected_events d where d.source_message_id = m.id)`,
    [userId, sourceMessageId],
  );
}

/** BR-06: deletes a Chat's Detected Events and every Source Message from it. Returns the deleted Detected Event ids. */
export async function deleteDetectedForChat(db: Db, userId: string, chatId: string): Promise<string[]> {
  const res = await db.query<{ id: string }>('delete from detected_events where user_id = $1 and chat_id = $2 returning id', [userId, chatId]);
  await db.query('delete from source_messages where user_id = $1 and chat_id = $2', [userId, chatId]);
  return res.rows.map((r) => r.id);
}

export type ConfirmedRow = {
  id: string;
  chat_id: string | null;
  chat_name: string | null;
  chat_colour: number | null;
  title: string;
  date: string;
  time: string | null;
  place: string | null;
};

const CONFIRMED_COLUMNS = `id, chat_id, chat_name, chat_colour, title,
  to_char(date, 'YYYY-MM-DD') as date, to_char(time, 'HH24:MI') as time, place`;

export type NewConfirmed = Omit<ConfirmedRow, 'id'>;

export async function insertConfirmed(db: Db, userId: string, e: NewConfirmed): Promise<ConfirmedRow> {
  const res = await db.query<ConfirmedRow>(
    `insert into confirmed_events (user_id, chat_id, chat_name, chat_colour, title, date, time, place)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${CONFIRMED_COLUMNS}`,
    [userId, e.chat_id, e.chat_name, e.chat_colour, e.title, e.date, e.time, e.place],
  );
  return res.rows[0];
}

/** AC-11.1, AC-11.2: Events not yet started (All-day ones through their date), in date-and-time order. Today and now are PKT. */
export async function listUpcoming(db: Db, userId: string, today: string, nowTime: string): Promise<ConfirmedRow[]> {
  const res = await db.query<ConfirmedRow>(
    `select ${CONFIRMED_COLUMNS} from confirmed_events
      where user_id = $1 and (date > $2::date or (date = $2::date and (time is null or time >= $3::time)))
      order by date, time nulls first, created_at`,
    [userId, today, nowTime],
  );
  return res.rows;
}

export async function getConfirmed(db: Db, userId: string, id: string, lock = false): Promise<ConfirmedRow | undefined> {
  const res = await db.query<ConfirmedRow>(
    `select ${CONFIRMED_COLUMNS} from confirmed_events where user_id = $1 and id = $2${lock ? ' for update' : ''}`,
    [userId, id],
  );
  return res.rows[0];
}

export type ConfirmedChange = { title: string; date: string; time: string | null; place: string | null };

export async function updateConfirmed(db: Db, userId: string, id: string, c: ConfirmedChange): Promise<void> {
  await db.query('update confirmed_events set title = $3, date = $4, time = $5, place = $6 where user_id = $1 and id = $2', [
    userId,
    id,
    c.title,
    c.date,
    c.time,
    c.place,
  ]);
}

export async function deleteConfirmed(db: Db, userId: string, id: string): Promise<boolean> {
  const res = await db.query('delete from confirmed_events where user_id = $1 and id = $2', [userId, id]);
  return res.rowCount === 1;
}
