import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import * as repo from './repository';

const BCRYPT_COST = 12;
export const SESSION_DAYS = 30; // architecture section 8

export type Session = { userId: string; email: string; token: string; expiresAt: Date };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function startSession(db: Pool, userId: string, email: string): Promise<Session> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await repo.insertSession(db, userId, hashToken(token), expiresAt);
  return { userId, email, token, expiresAt };
}

/** Returns undefined when the email already has an account. Inputs are already validated by domain.ts. */
export async function registerAccount(db: Pool, email: string, password: string): Promise<Session | undefined> {
  const user = await repo.insertUser(db, email, await bcrypt.hash(password, BCRYPT_COST));
  return user && startSession(db, user.id, user.email);
}

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password.
let dummyHash: string | undefined;

/** Returns undefined for a wrong email or password, without saying which. */
export async function signIn(db: Pool, email: string, password: string): Promise<Session | undefined> {
  const user = await repo.findActiveUserByEmail(db, email);
  dummyHash ??= await bcrypt.hash('not-a-real-password', BCRYPT_COST);
  const matches = await bcrypt.compare(password, user?.password_hash ?? dummyHash);
  return user && matches ? startSession(db, user.id, user.email) : undefined;
}

export async function signOut(db: Pool, token: string): Promise<void> {
  await repo.deleteSession(db, hashToken(token));
}

export async function userIdForToken(db: Pool, token: string): Promise<string | undefined> {
  return repo.findSessionUserId(db, hashToken(token));
}

export async function me(db: Pool, userId: string): Promise<{ email: string } | undefined> {
  const email = await repo.findEmail(db, userId);
  return email === undefined ? undefined : { email };
}
