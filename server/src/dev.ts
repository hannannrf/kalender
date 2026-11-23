// Local development entry. On Vercel, api/index.ts serves the app instead.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { app } from './app';

const envFile = resolve(__dirname, '../../.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Kalender API on http://localhost:${port}`));
