import pino from 'pino';
import { env, isProd } from './env.js';

// Never log secrets: these paths are redacted wherever they appear.
export const redactPaths = [
  'password', 'newPassword', 'confirmPassword', 'currentPassword', 'otp', 'token', 'apiKey', 'secret',
  '*.password', '*.newPassword', '*.confirmPassword', '*.currentPassword', '*.otp', '*.token', '*.apiKey', '*.secret',
  'req.headers.authorization', 'req.headers.cookie', 'req.headers["x-crm-key"]', 'res.headers["set-cookie"]',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[REDACTED]' },
  ...(isProd ? {} : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }),
});
