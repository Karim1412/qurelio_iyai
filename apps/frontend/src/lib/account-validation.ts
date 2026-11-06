import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js/min';

export const ACCOUNT_PASSWORD_MESSAGE =
  'Use 8–128 characters with uppercase, lowercase, a number, and a special character.';

export const ACCOUNT_PHONE_MESSAGE = 'Enter a valid phone number with country code.';

export function normalizeInternationalPhone(s: string): string {
  return s.replace(/[\s\-().]/g, '');
}

const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

/** New passwords (register, reset, change, setup). */
export const zPasswordPolicy = z
  .string()
  .min(8, 'At least 8 characters')
  .max(128, 'Maximum 128 characters')
  .regex(PASSWORD_COMPLEXITY, { message: ACCOUNT_PASSWORD_MESSAGE });

const PHONE_E164 = /^\+[1-9]\d{6,14}$/;

function phonePreprocess(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val);
}

/** Required phone: accepts `undefined` from PhoneInput before submit. */
export const zPhoneE164Required = z.preprocess(
  phonePreprocess,
  z
    .string()
    .min(1, 'Phone required')
    .superRefine((val, ctx) => {
      const s = normalizeInternationalPhone(val.trim());
      if (!s) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Phone required' });
        return;
      }
      if (!isValidPhoneNumber(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ACCOUNT_PHONE_MESSAGE });
        return;
      }
      if (!PHONE_E164.test(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ACCOUNT_PHONE_MESSAGE });
      }
    })
    .transform((val) => normalizeInternationalPhone(val.trim())),
);

/** Profile: allow empty; otherwise must be a valid international number. */
export const zPhoneE164Optional = z.preprocess(
  phonePreprocess,
  z
    .string()
    .transform((s) => normalizeInternationalPhone(s.trim()))
    .superRefine((s, ctx) => {
      if (s === '') return;
      if (!isValidPhoneNumber(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ACCOUNT_PHONE_MESSAGE });
        return;
      }
      if (!PHONE_E164.test(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: ACCOUNT_PHONE_MESSAGE });
      }
    }),
);
