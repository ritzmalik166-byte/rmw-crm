import rateLimit from 'express-rate-limit';
import { corsOrigins } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-authenticated routes: state-changing requests must come from an allowed
 * Origin (or Referer). Combined with SameSite=Lax cookies and a JSON-only body parser.
 */
export function originCheck(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin') || (() => { try { return new URL(req.get('referer')).origin; } catch { return null; } })();
  if (!origin || !corsOrigins.includes(origin)) return next(forbidden('Request origin not allowed', 'CSRF_REJECTED'));
  return next();
}

const handler = (_req, res, _next, options) => res.status(options.statusCode).json({
  success: false, message: 'Too many requests. Please slow down and try again shortly.', errorCode: 'RATE_LIMITED',
});

const make = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler });

export const limiters = {
  api: make(60_000, 300),
  login: make(15 * 60_000, 20),
  otpSend: make(15 * 60_000, 8),
  otpVerify: make(15 * 60_000, 20),
  register: make(60 * 60_000, 10),
  forgot: make(60 * 60_000, 10),
  integration: make(60_000, 600),
};
