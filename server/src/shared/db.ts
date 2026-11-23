import { Pool, type PoolClient } from 'pg';

let pool: Pool | undefined;

// Returns undefined when DATABASE_URL is not set, so the app can start without a database (S00).
export function getPool(): Pool | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  pool ??= new Pool({ connectionString: url, max: 3 });
  return pool;
}

export class DatabaseNotConfigured extends Error {
  name = 'DatabaseNotConfigured';
}

/** For routes that cannot work without a database; the app error handler turns this into a 503. */
export function db(): Pool {
  const p = getPool();
  if (!p) throw new DatabaseNotConfigured();
  return p;
}

/** A pool or a client inside a transaction; repositories accept either. */
export type Db = Pick<Pool, 'query'> | PoolClient;

/** Runs work in one transaction: commit on success, rollback on any error. */
export async function withTransaction<T>(pool: Pool, work: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
