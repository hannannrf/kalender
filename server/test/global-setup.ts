import './env';
import { closePool, getPool } from '../src/shared/db';
import { migrate } from '../src/shared/migrate';

// Database tests never delete other rows: each test creates its own Users with unique emails.
export default async function setup() {
  const pool = getPool();
  if (!pool) return;
  await migrate(pool);
  await closePool();
}
