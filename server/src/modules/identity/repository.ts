// The only code that touches users and sessions (ADR-005).
// Lookups by email or session token run before a userId exists, so they cannot take one (sign-up, sign-in, requireUser).
import type { Pool } from 'pg';
import type { Db } from '../../shared/db';

export type UserRow = { id: string; email: string; password_hash: string };

export async function insertUser(db: Pool, email: string, passwordHash: string): Promise<UserRow | undefined> {
  const res = await db.query<UserRow>(
    `insert into users (email, password_hash) values ($1, $2)
     on conflict (email) do nothing
     returning id, email, password_hash`,
    [email, passwordHash],
  );
  return res.rows[0];
}

export async function findActiveUserByEmail(db: Pool, email: string): Promise<UserRow | undefined> {
  const res = await db.query<UserRow>(
    'select id, email, password_hash from users where email = $1 and deletion_requested_at is null',
    [email],
  );
  return res.rows[0];
}

export async function findEmail(db: Pool, userId: string): Promise<string | undefined> {
  const res = await db.query<{ email: string }>('select email from users where id = $1', [userId]);
  return res.rows[0]?.email;
}

export async function insertSession(db: Pool, userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await db.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [tokenHash, userId, expiresAt]);
}

export async function findSessionUserId(db: Pool, tokenHash: string): Promise<string | undefined> {
  const res = await db.query<{ user_id: string }>(
    `select s.user_id from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.deletion_requested_at is null`,
    [tokenHash],
  );
  return res.rows[0]?.user_id;
}

export async function deleteSession(db: Pool, tokenHash: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [tokenHash]);
}

export async function findActivePasswordHash(db: Db, userId: string): Promise<string | undefined> {
  const res = await db.query<{ password_hash: string }>('select password_hash from users where id = $1 and deletion_requested_at is null', [userId]);
  return res.rows[0]?.password_hash;
}

/** R2-9: from now on sign-in and requireUser refuse this User. Keeps the first time if called again. */
export async function markDeletionRequested(db: Db, userId: string, at: Date): Promise<void> {
  await db.query('update users set deletion_requested_at = coalesce(deletion_requested_at, $2) where id = $1', [userId, at]);
}

/** The last deletion step: the User row, and its sessions with it (on delete cascade). */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.query('delete from users where id = $1', [userId]);
}

/** Tick task (architecture 8): sessions last 30 days. */
export async function purgeExpiredSessionsSystem(db: Db, now: Date): Promise<number> {
  const res = await db.query('delete from sessions where expires_at <= $1', [now]);
  return res.rowCount ?? 0;
}
