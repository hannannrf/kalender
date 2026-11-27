// The only code that talks to Google (AGENTS.md section 4 rule 6): OAuth and the Calendar REST API through built-in fetch.
// Every call answers a status code, 0 for a network error or timeout; nothing here throws for a Google failure.

const TIMEOUT_MS = 5000;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export type Tokens = { accessToken: string; expiresIn: number; refreshToken?: string };

/** What a copy holds in Google (architecture section 7): timed copies last 1 hour, All-day copies are all-day, in Asia/Karachi. */
export type GoogleEvent = {
  id: string;
  status: 'confirmed';
  summary: string;
  location?: string;
  description: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
};

export interface Google {
  /** The tokens for an authorisation code, or the status code Google refused it with. */
  exchangeCode(code: string, redirectUri: string): Promise<Tokens | number>;
  /** A new access token, or the status code (400 means the grant is expired or revoked). */
  refresh(refreshToken: string): Promise<Tokens | number>;
  insertEvent(accessToken: string, event: GoogleEvent): Promise<number>;
  updateEvent(accessToken: string, event: GoogleEvent): Promise<number>;
  deleteEvent(accessToken: string, id: string): Promise<number>;
  revoke(token: string): Promise<number>;
}

const client = () => ({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! });

async function send(url: string, init: RequestInit): Promise<Response | number> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return 0;
  }
}

async function token(form: Record<string, string>): Promise<Tokens | number> {
  const res = await send(TOKEN_URL, { method: 'POST', body: new URLSearchParams(form) });
  if (typeof res === 'number') return res;
  if (!res.ok) return res.status;
  const body = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  return { accessToken: body.access_token, expiresIn: body.expires_in, refreshToken: body.refresh_token };
}

async function call(accessToken: string, method: string, path: string, event?: GoogleEvent): Promise<number> {
  const res = await send(`${EVENTS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(event && { 'Content-Type': 'application/json' }) },
    body: event && JSON.stringify(event),
  });
  return typeof res === 'number' ? res : res.status;
}

export const googleApi: Google = {
  exchangeCode: (code, redirectUri) => token({ ...client(), code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  refresh: (refreshToken) => token({ ...client(), refresh_token: refreshToken, grant_type: 'refresh_token' }),
  insertEvent: (accessToken, event) => call(accessToken, 'POST', '', event),
  updateEvent: (accessToken, event) => call(accessToken, 'PUT', `/${event.id}`, event),
  deleteEvent: (accessToken, id) => call(accessToken, 'DELETE', `/${id}`),
  revoke: async (t) => {
    const res = await send('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: t }) });
    return typeof res === 'number' ? res : res.status;
  },
};

export function consentUrl(redirectUri: string, state: string): string {
  const query = new URLSearchParams({
    client_id: client().client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // a refresh token, so copies keep working after the hour the access token lasts
    prompt: 'consent', // Google sends a refresh token again on every reconnect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
}
