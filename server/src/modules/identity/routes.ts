import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from 'express';
import { db } from '../../shared/db';
import { userIdOf, type AuthedRequest } from '../../shared/http';
import { checkEmail, checkPassword } from './domain';
import * as service from './service';

export const COOKIE = 'kalender_session';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax', // the browser does not send it on cross-site POSTs, which blocks CSRF on our JSON API
  secure: process.env.VERCEL === '1',
  path: '/',
});

function readToken(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=') || undefined;
  }
  return undefined;
}

function sendSession(res: Response, status: number, session: service.Session) {
  res.cookie(COOKIE, session.token, { ...cookieOptions(), expires: session.expiresAt });
  res.status(status).json({ email: session.email });
}

/** Mounted before requireUser(): the only /api routes a signed-out person can use. */
export const publicRouter = Router();

publicRouter.post('/auth/register', async (req, res) => {
  const email = checkEmail(req.body?.email);
  const password = checkPassword(req.body?.password);
  if (!email.ok || !password.ok) {
    res.status(400).json({
      error: 'invalid',
      fields: { ...(!email.ok && { email: email.error }), ...(!password.ok && { password: password.error }) },
    });
    return;
  }
  const session = await service.registerAccount(db(), email.value, password.value);
  if (!session) {
    res.status(409).json({
      error: 'email_taken',
      fields: { email: 'An account with this email already exists. Sign in instead.' },
    });
    return;
  }
  sendSession(res, 201, session);
});

publicRouter.post('/auth/sign-in', async (req, res) => {
  const email = checkEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const session = email.ok && password ? await service.signIn(db(), email.value, password) : undefined;
  if (!session) {
    res.status(401).json({ error: 'wrong_credentials', message: 'Email or password is wrong.' });
    return;
  }
  sendSession(res, 200, session);
});

// Public so that signing out always works, even with an expired session.
publicRouter.post('/auth/sign-out', async (req, res) => {
  const token = readToken(req);
  if (token) await service.signOut(db(), token);
  res.clearCookie(COOKIE, cookieOptions());
  res.status(204).end();
});

/** Sets req.userId from the session cookie, or answers 401. Mounted once on /api by the composition root. */
export function requireUser(): RequestHandler {
  return async (req, res, next) => {
    const token = readToken(req);
    const userId = token ? await service.userIdForToken(db(), token) : undefined;
    if (!userId) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    (req as AuthedRequest).userId = userId;
    next();
  };
}

/** Mounted after requireUser(). */
export const router = Router();

router.get('/me', async (req, res) => {
  const me = await service.me(db(), userIdOf(req));
  if (!me) {
    res.status(401).json({ error: 'not_signed_in' });
    return;
  }
  res.json(me);
});
