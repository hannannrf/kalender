import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { closePool, db } from '../../shared/db';
import { hasDb, uniqueEmail } from '../../../test/db';
import { hashToken } from './service';

afterAll(closePool);

const PASSWORD = 'kal-5-baje-meeting';

async function register(email = uniqueEmail(), password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password });
  return { agent, res, email };
}

describe.skipIf(!hasDb)('identity routes (FR-01, BR-11)', () => {
  it('AC-01.1 register signs the User in', async () => {
    const { agent, res, email } = await register();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ email });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^kalender_session=[\w-]{43};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect((await agent.get('/api/me')).body).toEqual({ email });
  });

  it('AC-01.1 returning User signs in (email in any letter case)', async () => {
    const { email } = await register();
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/sign-in').send({ email: email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect((await agent.get('/api/me')).body).toEqual({ email });
  });

  it('refuses a wrong password and an unknown email with the same message', async () => {
    const { email } = await register();
    const wrong = await request(app).post('/api/auth/sign-in').send({ email, password: 'not-the-password' });
    const unknown = await request(app).post('/api/auth/sign-in').send({ email: uniqueEmail(), password: PASSWORD });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'wrong_credentials', message: 'Email or password is wrong.' });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('refuses a duplicate email, in any letter case', async () => {
    const { email } = await register();
    const res = await request(app).post('/api/auth/register').send({ email: ` ${email.toUpperCase()}`, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });

  it('refuses invalid details with a message per field', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'mahd', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid',
      fields: { email: 'Enter a valid email address.', password: 'Use at least 8 characters.' },
    });
  });

  it('sign-out ends the session', async () => {
    const { agent } = await register();
    expect((await agent.post('/api/auth/sign-out')).status).toBe(204);
    expect((await agent.get('/api/me')).status).toBe(401);
  });

  it('AC-01.2 two Users only ever see themselves', async () => {
    const a = await register(uniqueEmail('a'));
    const b = await register(uniqueEmail('b'));
    expect((await a.agent.get('/api/me')).body).toEqual({ email: a.email });
    expect((await b.agent.get('/api/me')).body).toEqual({ email: b.email });
    // A userId in the query or body is ignored: identity comes only from the session.
    expect((await a.agent.get('/api/me?userId=someone-else')).body).toEqual({ email: a.email });
  });

  it('refuses a missing or forged session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
    const forged = await request(app).get('/api/me').set('Cookie', 'kalender_session=forged-token');
    expect(forged.status).toBe(401);
    expect(forged.body).toEqual({ error: 'not_signed_in' });
  });

  it('answers unknown /api paths for a signed-in User with a JSON 404', async () => {
    const { agent } = await register();
    const res = await agent.get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('stores only hashes of the password and the session token', async () => {
    const { res, email } = await register();
    const token = /kalender_session=([^;]+)/.exec(res.headers['set-cookie'][0])![1];
    const user = await db().query('select password_hash from users where email = $1', [email]);
    expect(user.rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.rows[0].password_hash).not.toContain(PASSWORD);
    const sessions = await db().query('select token_hash from sessions where token_hash = $1 or token_hash = $2', [token, hashToken(token)]);
    expect(sessions.rows).toEqual([{ token_hash: hashToken(token) }]);
  });
});
