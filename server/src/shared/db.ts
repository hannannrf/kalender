import { Pool } from 'pg';

let pool: Pool | undefined;

// Returns undefined when DATABASE_URL is not set, so the app can start without a database (S00).
export function getPool(): Pool | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  pool ??= new Pool({ connectionString: url, max: 3 });
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
