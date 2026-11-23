// The only code that touches approved_chats (ADR-005). Every function takes userId first and filters by it.
import type { Db } from '../../shared/db';

export type ChatRow = {
  id: string;
  name: string;
  colour: number;
  look_back_days: number;
  approved_at: Date;
  last_upload_at: Date;
};

const COLUMNS = 'id, name, colour, look_back_days, approved_at, last_upload_at';

export async function listActive(db: Db, userId: string): Promise<ChatRow[]> {
  const res = await db.query<ChatRow>(
    `select ${COLUMNS} from approved_chats where user_id = $1 and revoked_at is null order by approved_at desc`,
    [userId],
  );
  return res.rows;
}

export type NewChat = {
  name: string;
  nameKey: string;
  lookBackDays: number;
  dateOrder: string;
  approvedAt: Date;
  startPoint: Date;
  readUpTo: Date | null;
  boundary: Record<string, number>;
};

/** Inserts with the first Chat colour not used by the User's other active Chats; undefined if the name is taken. */
export async function insertApproved(db: Db, userId: string, chat: NewChat): Promise<ChatRow | undefined> {
  const res = await db.query<ChatRow>(
    `insert into approved_chats
       (user_id, name, name_key, colour, look_back_days, date_order, approved_at, start_point, read_up_to, boundary, last_upload_at)
     values ($1, $2, $3,
       coalesce(
         (select min(c) from generate_series(1, 8) c
          where c not in (select colour from approved_chats where user_id = $1 and revoked_at is null)),
         (select count(*) % 8 + 1 from approved_chats where user_id = $1 and revoked_at is null)),
       $4, $5, $6, $7, $8, $9, $6)
     on conflict (user_id, name_key) where revoked_at is null do nothing
     returning ${COLUMNS}`,
    [userId, chat.name, chat.nameKey, chat.lookBackDays, chat.dateOrder, chat.approvedAt, chat.startPoint, chat.readUpTo, chat.boundary],
  );
  return res.rows[0];
}
