// `npm run migrate -w server`. Also runs in `npm run build`, so each Vercel build migrates its own database.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { closePool, getPool } from './shared/db';
import { migrate } from './shared/migrate';

const envFile = resolve(__dirname, '../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const pool = getPool();
  if (!pool) {
    console.log('migrate: DATABASE_URL is not set, nothing to do');
    return;
  }
  const applied = await migrate(pool);
  console.log(`migrate: applied ${applied.length} (${applied.join(', ') || 'none new'})`);
  await closePool();
}

main().catch((err: { name?: string; code?: string }) => {
  // Only the error name and code: messages can contain connection details.
  console.error(`migrate failed: ${err?.name} ${err?.code ?? ''}`);
  process.exit(1);
});
