import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import * as chats from '../chats';
import * as events from '../events';
import * as jobs from '../jobs';
import * as reminders from '../reminders';
import { withTransaction, type Db } from '../../shared/db';
import { logError } from '../../shared/log';
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

// ---- Account deletion (FR-13, MF-07, AC-13.1, AC-13.3; architecture 6.3, Q-24, R2-9) ----

const RESUME = 'identity.resumeAccountDeletion';
const SWEEP_AFTER_MS = 5 * 60 * 1000;

/**
 * Every module's data, then the User row and its sessions. Each step is idempotent and publishes no outbox
 * messages, so Google Calendar copies stay (MF-06). S11 adds calendar-sync.deleteAllForUser here.
 */
const STEPS: ((tx: Db, userId: string) => Promise<void>)[] = [
  jobs.deleteAllForUser,
  chats.deleteAllForUser,
  events.deleteAllForUser,
  reminders.deleteAllForUser,
  repo.deleteUser,
];

/** First transaction: the User is refused from now on, and the resume job is queued with no user_id, so the jobs step keeps it. */
export async function requestDeletion(db: Pool, userId: string, now: Date): Promise<void> {
  await withTransaction(db, async (tx) => {
    await repo.markDeletionRequested(tx, userId, now);
    await jobs.enqueue(tx, RESUME, { userId }, { runAt: new Date(now.getTime() + SWEEP_AFTER_MS), dedupeKey: userId });
  });
}

/** Runs every step, each in its own transaction. */
export async function finishDeletion(db: Pool, userId: string): Promise<void> {
  for (const step of STEPS) await withTransaction(db, (tx) => step(tx, userId));
}

/**
 * AC-13.1, AC-13.3: deletes the account after checking the password again (S09 Gate 1).
 * If a step fails, the resume job finishes on a later tick; the User is already refused.
 */
export async function deleteAccount(db: Pool, userId: string, password: unknown, now: Date): Promise<'deleted' | 'wrong_password'> {
  const hash = await repo.findActivePasswordHash(db, userId);
  if (!hash || typeof password !== 'string' || !(await bcrypt.compare(password, hash))) return 'wrong_password';
  await requestDeletion(db, userId, now);
  try {
    await finishDeletion(db, userId);
  } catch (err) {
    logError('identity.deleteAccount', err); // ids only; the resume job finishes the rest
  }
  return 'deleted';
}

/** Called once by the composition root (Q-1). The resume job also runs once after a deletion that worked, as a sweep. */
export function register(registry: jobs.Registry): void {
  registry.registerHandler(RESUME, async (tx, job) => {
    for (const step of STEPS) await step(tx, String(job.payload.userId));
  });
  registry.registerTickTask('identity.purgeExpiredSessions', (db, now) => repo.purgeExpiredSessionsSystem(db, now));
}
