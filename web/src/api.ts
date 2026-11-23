// Thin JSON client for /api. Errors carry the server's JSON body so screens can show field messages.
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; message?: string; fields?: Record<string, string> },
  ) {
    super(body.error ?? `HTTP ${status}`);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { body } = options;
  const json = body !== undefined && !(body instanceof FormData); // FormData sets its own multipart header
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: json ? { 'Content-Type': 'application/json' } : undefined,
    body: json ? JSON.stringify(body) : (body as FormData | undefined),
  });
  if (res.status === 204) return undefined as T;
  // An HTML page (dev proxy fallback, a Vercel login page, an offline page) is never a valid answer, even with 200.
  if (!res.headers.get('content-type')?.includes('application/json')) throw new ApiError(res.ok ? 502 : res.status, {});
  const answer = await res.json();
  if (!res.ok) throw new ApiError(res.status, answer);
  return answer as T;
}
