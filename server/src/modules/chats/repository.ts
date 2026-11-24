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

/** What an update needs: the pointers and the file checks (BR-02, BR-15). Locked for the update transaction. */
export type UploadState = ChatRow & {
  name_key: string;
  date_order: 'DMY' | 'MDY';
  start_point: Date;
  read_up_to: Date | null;
  boundary: Record<string, number>;
  revoked_at: Date | null;
};

/** The Chat, revoked or not; undefined if it is not this User's. */
export async function getForUpload(db: Db, userId: string, id: string): Promise<UploadState | undefined> {
  const res = await db.query<UploadState>(
    `select ${COLUMNS}, name_key, date_order, start_point, read_up_to, boundary, revoked_at
       from approved_chats where user_id = $1 and id = $2 for update`,
    [userId, id],
  );
  return res.rows[0];
}

export async function saveUpload(
  db: Db,
  userId: string,
  id: string,
  u: { readUpTo: Date | null; boundary: Record<string, number>; at: Date },
): Promise<ChatRow> {
  const res = await db.query<ChatRow>(
    `update approved_chats set read_up_to = $3, boundary = $4, last_upload_at = $5
      where user_id = $1 and id = $2 returning ${COLUMNS}`,
    [userId, id, u.readUpTo, u.boundary, u.at],
  );
  return res.rows[0];
}

/** BR-06: keeps the row without text (R2-15) and clears the Read-up-to Point. False if not found or already revoked. */
export async function revoke(db: Db, userId: string, id: string, at: Date): Promise<boolean> {
  const res = await db.query(
    `update approved_chats set revoked_at = $3, read_up_to = null, boundary = '{}'
      where user_id = $1 and id = $2 and revoked_at is null`,
    [userId, id, at],
  );
  return (res.rowCount ?? 0) > 0;
}

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
