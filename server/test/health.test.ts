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

  it('answers unknown /api paths with a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
