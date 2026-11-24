// jobs (architecture 5.2, ADR-002): job table, transactional outbox and the per-minute tick.
// It imports no feature module: modules register handlers, subscribers and tick tasks into it (Q-1).
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { OutboxMessage, OutboxType } from '../../shared/contracts/outbox';
import { withTransaction, type Db } from '../../shared/db';
import { logError } from '../../shared/log';
import * as repo from './repository';

export type Job = { id: string; type: string; payload: Record<string, unknown>; userId: string | null; runAt: Date };
export type JobHandler = (tx: PoolClient, job: Job, now: Date) => Promise<void>;
export type Subscriber = (tx: PoolClient, message: OutboxMessage, now: Date) => Promise<void>;
export type TickTask = (db: Pool, now: Date) => Promise<number>;

const handlers = new Map<string, JobHandler>();
const subscribers = new Map<OutboxType, Map<string, Subscriber>>();
const tickTasks = new Map<string, TickTask>();

// ---- Registry (called only from each module's register, via the composition root) ----

export function registerHandler(type: string, fn: JobHandler): void {
  handlers.set(type, fn);
}

export function subscribe(type: OutboxType, name: string, fn: Subscriber): void {
  if (!subscribers.has(type)) subscribers.set(type, new Map());
  subscribers.get(type)!.set(name, fn);
}

export function registerTickTask(name: string, fn: TickTask): void {
  tickTasks.set(name, fn);
}

export type Registry = { registerHandler: typeof registerHandler; subscribe: typeof subscribe; registerTickTask: typeof registerTickTask };

// ---- Writing work inside the caller's transaction ----

/** Adds a job, or moves the pending job with the same type and dedupe key to the new time and payload. */
export async function enqueue(
  tx: Db,
  type: string,
  payload: Record<string, unknown>,
  options: { runAt: Date; userId?: string; dedupeKey?: string },
): Promise<void> {
  await repo.insertJob(tx, type, payload, options.runAt, options.userId ?? null, options.dedupeKey ?? null);
}

/** Cancels the pending job with this type and dedupe key, if any. */
export async function cancel(tx: Db, type: string, dedupeKey: string): Promise<void> {
  await repo.cancelJob(tx, type, dedupeKey);
}

/** Writes an outbox message in the caller's transaction, so it exists exactly when the change commits (ADR-002). */
export async function publish(tx: Db, message: OutboxMessage): Promise<void> {
  await repo.insertOutbox(tx, message.type, message.payload, message.payload.userId);
}

// ---- Running work ----

/**
 * Hands pending outbox messages, oldest first, to every subscriber of their type.
 * Each message runs in one transaction: all its subscribers succeed, or none is recorded and the next run tries again.
 */
export async function dispatchOutbox(db: Pool, now: Date, options: { limit: number; timeBudgetMs: number }): Promise<number> {
  const started = Date.now();
  let dispatched = 0;
  for (const id of await repo.pendingOutboxIdsSystem(db, options.limit)) {
    if (Date.now() - started > options.timeBudgetMs) break;
    try {
      const done = await withTransaction(db, async (tx) => {
        const message = await repo.claimOutboxSystem(tx, id);
        if (!message) return false; // dispatched by an overlapping run
        for (const [name, fn] of subscribers.get(message.type) ?? []) {
          if (await repo.recordDeliverySystem(tx, id, name)) await fn(tx, message, now);
        }
        await repo.markDispatchedSystem(tx, id, now);
        return true;
      });
      if (done) dispatched++;
    } catch (err) {
      // shortcut: a failing message is retried on every tick without a limit; S11 adds per-subscriber retries for Google calls.
      logError(`jobs.dispatchOutbox outbox=${id}`, err);
    }
  }
  return dispatched;
}

const MAX_ATTEMPTS = 3;

/** Runs up to `limit` due jobs, each in its own transaction. A failed job is tried again a minute later, three times at most. */
export async function runDueJobs(db: Pool, now: Date, limit: number): Promise<number> {
  let ran = 0;
  while (ran < limit) {
    const outcome = await withTransaction(db, async (tx) => {
      const job = await repo.claimDueJobSystem(tx, now);
      if (!job) return 'none' as const;
      const handler = handlers.get(job.type);
      try {
        if (!handler) throw new Error('no handler');
        await tx.query('savepoint job');
        await handler(tx, job, now);
        await repo.finishJobSystem(tx, job.id, 'done', now);
      } catch (err) {
        await tx.query('rollback to savepoint job').catch(() => undefined);
        logError(`jobs.run ${job.type} job=${job.id}`, err);
        await repo.retryJobSystem(tx, job.id, now, MAX_ATTEMPTS);
      }
      return 'ran' as const;
    });
    if (outcome === 'none') break;
    ran++;
  }
  return ran;
}

export type TickResult = { outbox: number; jobs: number; tasks: Record<string, number> };

/**
 * One tick (ADR-002, R2-1): the outbox first, so a pending delete or edit reaches its subscribers
 * before a stale Reminder could be sent; then due jobs; then tick tasks such as Reminder delivery.
 */
export async function tick(db: Pool, now: Date): Promise<TickResult> {
  const outbox = await dispatchOutbox(db, now, { limit: 200, timeBudgetMs: 20_000 });
  const jobs = await runDueJobs(db, now, 50);
  const tasks: Record<string, number> = {};
  for (const [name, fn] of tickTasks) {
    try {
      tasks[name] = await fn(db, now);
    } catch (err) {
      logError(`jobs.tickTask ${name}`, err);
      tasks[name] = -1;
    }
  }
  return { outbox, jobs, tasks };
}

/** Housekeeping (Q-15): finished jobs and dispatched outbox rows are kept 7 days. */
registerTickTask('jobs.housekeeping', (db, now) => repo.purgeFinishedSystem(db, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)));

/** Constant-time comparison of the tick secret, through equal-length hashes. */
export function tickSecretMatches(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(`Bearer ${secret}`).digest();
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
