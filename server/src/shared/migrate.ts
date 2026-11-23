import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const dir = resolve(__dirname, '../../migrations');

// Applies server/migrations/*.sql in name order, each once, each in its own transaction.
export async function migrate(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
      await client.query('begin');
      try {
        // Serialises concurrent runs (two builds against one database).
        await client.query('select pg_advisory_xact_lock(4242)');
        const done = await client.query('select 1 from schema_migrations where name = $1', [name]);
        if (done.rowCount === 0) {
          await client.query(readFileSync(resolve(dir, name), 'utf8'));
          await client.query('insert into schema_migrations (name) values ($1)', [name]);
          applied.push(name);
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    }
  } finally {
    client.release();
  }
  return applied;
}
