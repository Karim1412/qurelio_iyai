/**
 * Shared rules for registration and password changes.
 * Keep in sync with apps/frontend/src/lib/account-validation.ts
 */

/** At least 8 chars, upper, lower, digit, special. Max 128. */
export const ACCOUNT_PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$/;

export const ACCOUNT_PASSWORD_MESSAGE =
  'Password must be 8–128 characters and include uppercase, lowercase, a number, and a special character.';

/**
 * E.164-style: leading +, then 7–15 digits (country code + national number).
 * Spaces/dashes/parentheses stripped before matching (see normalizeInternationalPhone).
 */
export const ACCOUNT_PHONE_E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export const ACCOUNT_PHONE_MESSAGE =
  'Phone must start with + followed by the country code and number (e.g. +21612345678).';

export function normalizeInternationalPhone(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.replace(/[\s\-().]/g, '');
}
