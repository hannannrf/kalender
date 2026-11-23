// Pure validation for account details (FR-01). EP/BVA cases in domain.test.ts.
export const MAX_EMAIL_LENGTH = 254;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

export type Check = { ok: true; value: string } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkEmail(input: unknown): Check {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: 'Enter a valid email address.' };
  }
  return { ok: true, value: email };
}

export function checkPassword(input: unknown): Check {
  if (typeof input !== 'string' || input.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (Buffer.byteLength(input, 'utf8') > MAX_PASSWORD_BYTES) {
    return { ok: false, error: `Use at most ${MAX_PASSWORD_BYTES} characters.` };
  }
  return { ok: true, value: input };
}
