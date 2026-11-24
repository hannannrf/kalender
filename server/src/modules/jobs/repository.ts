// The only code that touches jobs, outbox and outbox_deliveries (ADR-005).
// Functions named ...System work across Users; they are called only by the tick and dispatch (Q-8).
import type { OutboxMessage } from '../../shared/contracts/outbox';
import type { Db } from '../../shared/db';
import type { Job } from './service';

export async function insertJob(db: Db, type: string, payload: object, runAt: Date, userId: string | null, dedupeKey: string | null): Promise<void> {
  await db.query(
    `insert into jobs (type, payload, run_at, user_id, dedupe_key) values ($1, $2, $3, $4, $5)
     on conflict (type, dedupe_key) where status = 'pending' and dedupe_key is not null
     do update set payload = excluded.payload, run_at = excluded.run_at, user_id = excluded.user_id`,
    [type, payload, runAt, userId, dedupeKey],
  );
}

export async function cancelJob(db: Db, type: string, dedupeKey: string): Promise<void> {
  await db.query(`update jobs set status = 'cancelled', finished_at = now() where type = $1 and dedupe_key = $2 and status = 'pending'`, [type, dedupeKey]);
}

export async function insertOutbox(db: Db, type: string, payload: object, userId: string): Promise<void> {
  await db.query('insert into outbox (type, payload, user_id) values ($1, $2, $3)', [type, payload, userId]);
}

export async function pendingOutboxIdsSystem(db: Db, limit: number): Promise<string[]> {
  const res = await db.query<{ id: string }>('select id from outbox where dispatched_at is null order by id limit $1', [limit]);
  return res.rows.map((r) => r.id);
}

export async function claimOutboxSystem(db: Db, id: string): Promise<OutboxMessage | undefined> {
  const res = await db.query<OutboxMessage>('select type, payload from outbox where id = $1 and dispatched_at is null for update skip locked', [id]);
  return res.rows[0];
}

/** True when this subscriber had not yet handled the message. */
export async function recordDeliverySystem(db: Db, outboxId: string, subscriber: string): Promise<boolean> {
  const res = await db.query('insert into outbox_deliveries (outbox_id, subscriber) values ($1, $2) on conflict do nothing', [outboxId, subscriber]);
  return res.rowCount === 1;
}

export async function markDispatchedSystem(db: Db, id: string, now: Date): Promise<void> {
  await db.query('update outbox set dispatched_at = $2 where id = $1', [id, now]);
}

export async function claimDueJobSystem(db: Db, now: Date): Promise<Job | undefined> {
  const res = await db.query<{ id: string; type: string; payload: Record<string, unknown>; user_id: string | null; run_at: Date }>(
    `select id, type, payload, user_id, run_at from jobs
      where status = 'pending' and run_at <= $1
      order by run_at, id limit 1 for update skip locked`,
    [now],
  );
  const r = res.rows[0];
  return r && { id: r.id, type: r.type, payload: r.payload, userId: r.user_id, runAt: r.run_at };
}

export async function finishJobSystem(db: Db, id: string, status: 'done' | 'failed', now: Date): Promise<void> {
  await db.query('update jobs set status = $2, attempts = attempts + 1, finished_at = $3 where id = $1', [id, status, now]);
}

/** After a failure: try again in one minute, or mark failed once `max` attempts are used. */
export async function retryJobSystem(db: Db, id: string, now: Date, max: number): Promise<void> {
  await db.query(
    `update jobs set attempts = attempts + 1,
            status = case when attempts + 1 >= $3 then 'failed' else 'pending' end,
            finished_at = case when attempts + 1 >= $3 then $2::timestamptz else null end,
            run_at = $2::timestamptz + interval '1 minute'
      where id = $1`,
    [id, now, max],
  );
}

export async function purgeFinishedSystem(db: Db, before: Date): Promise<number> {
  const jobs = await db.query(`delete from jobs where status <> 'pending' and finished_at < $1`, [before]);
  const outbox = await db.query('delete from outbox where dispatched_at < $1', [before]);
  return (jobs.rowCount ?? 0) + (outbox.rowCount ?? 0);
}
