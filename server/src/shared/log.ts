// Redacting logger (AGENTS.md section 5): ids, codes, counts and timings only.
// Error messages are never logged, because database errors can quote stored values (emails, message text).
export function logError(where: string, err: unknown): void {
  const e = (err ?? {}) as { name?: string; code?: string };
  console.error(JSON.stringify({ level: 'error', where, name: e.name ?? 'unknown', code: e.code }));
}
