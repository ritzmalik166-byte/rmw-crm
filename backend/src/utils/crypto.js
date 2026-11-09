import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
export const hmacSha256 = (secret, value) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function randomDigits(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += crypto.randomInt(0, 10).toString();
  return out;
}

// AES-256-GCM for secrets that must be recoverable (e.g. integration HMAC secrets).
const encKey = crypto.createHash('sha256').update(env.APP_ENCRYPTION_KEY).digest();

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = String(payload).split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
