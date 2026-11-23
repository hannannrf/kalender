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
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = res.status === 204 ? undefined : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body ?? {});
  return body as T;
}
