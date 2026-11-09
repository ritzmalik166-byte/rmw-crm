import { env } from '../../config/env.js';

const base = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax',
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export const cookies = {
  setSession: (res, token, maxAgeMs) => res.cookie(env.SESSION_COOKIE_NAME, token, { ...base(), maxAge: maxAgeMs }),
  clearSession: (res) => res.clearCookie(env.SESSION_COOKIE_NAME, base()),
  // Device identifier: random, server-generated, only meaningful together with a server-side trust record.
  setDevice: (res, token) => res.cookie(env.DEVICE_COOKIE_NAME, token, { ...base(), maxAge: 400 * 24 * 3600 * 1000 }),
  setChallenge: (res, token) => res.cookie(env.CHALLENGE_COOKIE_NAME, token, { ...base(), maxAge: 15 * 60 * 1000 }),
  clearChallenge: (res) => res.clearCookie(env.CHALLENGE_COOKIE_NAME, base()),
  read: (req, name) => req.cookies?.[name] || null,
};
