import { z } from 'zod';
import { badRequest } from '../utils/errors.js';
import { normalizePhone } from '../utils/normalize.js';

export function validatePasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 128) return 'Password is too long';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Password must include upper-case, lower-case and a number';
  return null;
}

export const passwordSchema = z.string().superRefine((v, ctx) => {
  const msg = validatePasswordStrength(v);
  if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
});

export const mobileSchema = z.string().trim().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n || n.length < 10 || n.length > 15) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid mobile number' });
    return z.NEVER;
  }
  return n;
});

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email').max(190);
export const idParam = z.coerce.number().int().positive();

/** Express middleware factory: validates req[part] and replaces it with the parsed value. */
export const validate = (schema, part = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[part] ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return next(badRequest(details[0]?.message || 'Validation failed', 'VALIDATION_ERROR', details));
  }
  if (part === 'query') req.validQuery = result.data; // req.query is a getter in Express 5-compatible setups
  else req[part] = result.data;
  return next();
};

/** Profile picture as a base64 data URL; the client resizes it first. null removes the picture. */
export const avatarSchema = z.string()
  .max(150_000, 'Image is too large. Use a picture under 100 KB after resizing.')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Upload a PNG, JPEG or WebP image')
  .nullable();
