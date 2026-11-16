import 'dotenv/config';
import { z } from 'zod';

const bool = (d) => z.string().optional().transform((v) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(v.toLowerCase())));
const int = (d) => z.string().optional().transform((v) => (v === undefined || v === '' ? d : parseInt(v, 10)));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: int(4000),
  APP_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  TRUST_PROXY: int(1),
  LOG_LEVEL: z.string().default('info'),

  DB_HOST: z.string(),
  DB_PORT: int(3306),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_SSL: bool(true),
  DB_SSL_CA: z.string().optional(), // optional CA certificate (path or PEM) when DB_SSL=true
  DB_POOL_SIZE: int(10),

  REDIS_URL: z.string().optional(),

  SESSION_COOKIE_NAME: z.string().default('crm_sid'),
  DEVICE_COOKIE_NAME: z.string().default('crm_did'),
  CHALLENGE_COOKIE_NAME: z.string().default('crm_chal'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: bool(false),
  APP_ENCRYPTION_KEY: z.string().min(32, 'APP_ENCRYPTION_KEY must be at least 32 chars'),

  SMS_API_URL: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_OTP_TEMPLATE: z.string().optional(),
  SMS_TEMPLATE_ID: z.string().optional(),
  OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 chars'),
  OTP_LENGTH: int(6),
  OTP_TTL_SECONDS: int(300),
  OTP_RESEND_COOLDOWN_SECONDS: int(60),
  OTP_MAX_ATTEMPTS: int(5),
  OTP_MAX_SENDS_PER_HOUR: int(5),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('RMW CRM <no-reply@ritzmediaworld.com>'),

  MPF_API_URL: z.string().optional(),
  MPF_CRM_EXPORT_KEY: z.string().optional(),
  MPF_ADMIN_EMAIL: z.string().optional(),
  MPF_ADMIN_PASSWORD: z.string().optional(),
  RMW_ENQUIRY_LIST_URL: z.string().optional(),
  RMW_RESUME_BASE_URL: z.string().default('https://ritzmediaworld.com'),
  CT_API_URL: z.string().optional(),
  CT_ADMIN_EMAIL: z.string().optional(),
  CT_ADMIN_PASSWORD: z.string().optional(),
  SYNC_INTERVAL_MINUTES: int(0),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@ritzmediaworld.com'),
  EXPO_ACCESS_TOKEN: z.string().optional(), // optional: only needed if Expo push security is enabled for the project

  // Meta (Facebook + Instagram) Lead Ads. The integration stays disabled until APP_ID, APP_SECRET and REDIRECT_URI are set.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(), // {APP_URL}/api/integrations/meta/oauth/callback
  META_API_VERSION: z.string().optional().transform((v) => (v && /^v\d+\.\d+$/.test(v.trim()) ? v.trim() : 'v23.0')),
  META_LOGIN_CONFIG_ID: z.string().optional(), // Facebook Login for Business configuration id (replaces the scope list)
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(), // any random string; paste the same value in the Meta app webhook settings
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + parsed.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
