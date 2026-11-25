// The only code that touches calendar_links and calendar_copies (ADR-005). Every query is scoped by user_id (BR-11).
import type { Db } from '../../shared/db';

export type LinkRow = {
  user_id: string;
  refresh_token: string; // ciphertext
  access_token: string | null; // ciphertext
  access_expires_at: Date | null;
  status: 'linked' | 'needs_reconnect';
};

export type Details = { title: string; date: string; time: string | null; place: string | null };

export type CopyRow = {
  event_id: string;
  user_id: string;
  details: Details | null; // null: the copy should be removed
  in_google: boolean;
  status: 'synced' | 'pending' | 'failed';
  first_failed_at: Date | null;
  retries: number;
};

export async function getLink(db: Db, userId: string): Promise<LinkRow | undefined> {
  const res = await db.query<LinkRow>('select user_id, refresh_token, access_token, access_expires_at, status from calendar_links where user_id = $1', [userId]);
  return res.rows[0];
}

/** Links, or relinks with new tokens. */
export async function upsertLink(db: Db, userId: string, refreshToken: string, accessToken: string, expiresAt: Date): Promise<void> {
  await db.query(
    `insert into calendar_links (user_id, refresh_token, access_token, access_expires_at) values ($1, $2, $3, $4)
     on conflict (user_id) do update set refresh_token = excluded.refresh_token, access_token = excluded.access_token,
       access_expires_at = excluded.access_expires_at, status = 'linked', linked_at = now()`,
    [userId, refreshToken, accessToken, expiresAt],
  );
}

export async function setAccessToken(db: Db, userId: string, accessToken: string | null, expiresAt: Date | null): Promise<void> {
  await db.query('update calendar_links set access_token = $2, access_expires_at = $3 where user_id = $1', [userId, accessToken, expiresAt]);
}

export async function setNeedsReconnect(db: Db, userId: string): Promise<void> {
  await db.query(`update calendar_links set status = 'needs_reconnect', access_token = null, access_expires_at = null where user_id = $1`, [userId]);
}

export async function deleteLink(db: Db, userId: string): Promise<void> {
  await db.query('delete from calendar_links where user_id = $1', [userId]);
}

export async function getCopy(db: Db, userId: string, eventId: string, lock = false): Promise<CopyRow | undefined> {
  const res = await db.query<CopyRow>(
    `select event_id, user_id, details, in_google, status, first_failed_at, retries from calendar_copies
      where user_id = $1 and event_id = $2${lock ? ' for update' : ''}`,
    [userId, eventId],
  );
  return res.rows[0];
}

/** Records what the copy should show now (null: removed); whether it is in Google stays as it was. */
export async function setDesired(db: Db, userId: string, eventId: string, details: Details | null): Promise<void> {
  await db.query(
    `insert into calendar_copies (event_id, user_id, details) values ($2, $1, $3)
     on conflict (event_id) do update set details = excluded.details where calendar_copies.user_id = $1`,
    [userId, eventId, details],
  );
}

export async function markSynced(db: Db, userId: string, eventId: string): Promise<void> {
  await db.query(
    `update calendar_copies set in_google = true, status = 'synced', first_failed_at = null, retries = 0 where user_id = $1 and event_id = $2`,
    [userId, eventId],
  );
}

export async function markFailure(db: Db, userId: string, eventId: string, status: 'pending' | 'failed', firstFailedAt: Date, retries: number): Promise<void> {
  await db.query('update calendar_copies set status = $3, first_failed_at = $4, retries = $5 where user_id = $1 and event_id = $2', [
    userId,
    eventId,
    status,
    firstFailedAt,
    retries,
  ]);
}

export async function deleteCopy(db: Db, userId: string, eventId: string): Promise<void> {
  await db.query('delete from calendar_copies where user_id = $1 and event_id = $2', [userId, eventId]);
}

/**
 * On unlink (R2-8): copies that never reached Google, or were waiting to be removed, are forgotten; the others stay as synced,
 * so a relink updates them instead of adding a second copy. Answers the copies that had a retry pending.
 */
export async function settleCopiesOnUnlink(db: Db, userId: string): Promise<{ event_id: string; retries: number }[]> {
  const pending = await db.query<{ event_id: string; retries: number }>(`select event_id, retries from calendar_copies where user_id = $1 and status = 'pending'`, [userId]);
  await db.query('delete from calendar_copies where user_id = $1 and (not in_google or details is null)', [userId]);
  await db.query(`update calendar_copies set status = 'synced', first_failed_at = null, retries = 0 where user_id = $1`, [userId]);
  return pending.rows;
}

export async function listFailed(db: Db, userId: string, eventIds: string[]): Promise<string[]> {
  const res = await db.query<{ event_id: string }>(`select event_id from calendar_copies where user_id = $1 and event_id = any($2) and status = 'failed'`, [
    userId,
    eventIds,
  ]);
  return res.rows.map((r) => r.event_id);
}

/** AC-13.3: the User's link and copies. */
export async function deleteAllForUser(db: Db, userId: string): Promise<void> {
  await db.query('delete from calendar_copies where user_id = $1', [userId]);
  await db.query('delete from calendar_links where user_id = $1', [userId]);
}
