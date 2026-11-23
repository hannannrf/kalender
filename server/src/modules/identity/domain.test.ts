import { describe, expect, it } from 'vitest';
import { checkEmail, checkPassword } from './domain';

const emailOf = (length: number) => `${'a'.repeat(length - '@example.com'.length)}@example.com`;

describe('checkEmail (EP and BVA)', () => {
  it('accepts a valid email', () => {
    expect(checkEmail('mahd@example.com')).toEqual({ ok: true, value: 'mahd@example.com' });
  });

  it('trims and lower-cases', () => {
    expect(checkEmail('  Mahd@Example.COM ')).toEqual({ ok: true, value: 'mahd@example.com' });
  });

  it.each(['', 'mahd', 'mahd@example', 'mahd ali@example.com', '@example.com'])('refuses %j', (input) => {
    expect(checkEmail(input)).toEqual({ ok: false, error: 'Enter a valid email address.' });
  });

  it('accepts 254 characters and refuses 255', () => {
    expect(checkEmail(emailOf(254)).ok).toBe(true);
    expect(checkEmail(emailOf(255)).ok).toBe(false);
  });

  it.each([undefined, null, 42])('refuses a non-string (%j)', (input) => {
    expect(checkEmail(input).ok).toBe(false);
  });
});

describe('checkPassword (EP and BVA)', () => {
  it('refuses 7 characters and accepts 8', () => {
    expect(checkPassword('a'.repeat(7))).toEqual({ ok: false, error: 'Use at least 8 characters.' });
    expect(checkPassword('a'.repeat(8)).ok).toBe(true);
  });

  it('accepts 72 bytes and refuses 73', () => {
    expect(checkPassword('a'.repeat(72)).ok).toBe(true);
    expect(checkPassword('a'.repeat(73))).toEqual({ ok: false, error: 'Use at most 72 characters.' });
  });

  it('counts bytes, not characters (37 two-byte letters are 74 bytes)', () => {
    expect(checkPassword('é'.repeat(37)).ok).toBe(false);
  });

  it.each([undefined, null, 12345678])('refuses a non-string (%j)', (input) => {
    expect(checkPassword(input).ok).toBe(false);
  });
});
