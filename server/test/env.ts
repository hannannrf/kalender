// Lets local runs use the Neon dev branch from .env.local; CI sets DATABASE_URL itself.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../../.env.local');
if (!process.env.CI && existsSync(envFile)) process.loadEnvFile(envFile);
