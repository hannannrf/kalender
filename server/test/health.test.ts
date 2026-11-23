import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { closePool } from '../src/shared/db';

afterAll(closePool);

describe('GET /api/health', () => {
  it.skipIf(process.env.DATABASE_URL)('reports the database as not configured when DATABASE_URL is missing', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'not_configured' });
  });

  it.runIf(process.env.DATABASE_URL)('reaches the database when DATABASE_URL is set', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('answers other /api paths with 401 when signed out', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'not_signed_in' });
  });

  it.skipIf(process.env.DATABASE_URL)('answers identity routes with 503 when there is no database', async () => {
    const res = await request(app).post('/api/auth/sign-in').send({ email: 'mahd@example.com', password: 'kal-5-baje' });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'database_not_configured' });
  });
});
