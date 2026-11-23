import { randomUUID } from 'node:crypto';

export const hasDb = Boolean(process.env.DATABASE_URL);
export const uniqueEmail = (who = 'user') => `${who}-${randomUUID()}@test.kalender.app`;
