import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { otpRepo } from '../../repositories/authRepo.js';
import { hmacSha256, randomDigits, safeEqual } from '../../utils/crypto.js';
import { AppError, tooMany } from '../../utils/errors.js';

const PROVIDER_TIMEOUT_MS = 10_000;

export function isOtpProviderConfigured() {
  return Boolean(env.SMS_API_URL && env.SMS_API_KEY && env.SMS_SENDER_ID && env.SMS_OTP_TEMPLATE);
}


function providerNumber(mobile) {
  const d = String(mobile).replace(/\D/g, '');
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d;
}

async function sendSms(mobile, otp) {
  if (!isOtpProviderConfigured()) {
    throw new AppError('OTP service is not configured. Contact your administrator.', { status: 503, errorCode: 'OTP_PROVIDER_NOT_CONFIGURED' });
  }
  const url = new URL(env.SMS_API_URL);
  url.searchParams.set('apikey', env.SMS_API_KEY);
  url.searchParams.set('senderid', env.SMS_SENDER_ID);
  url.searchParams.set('number', providerNumber(mobile));
  url.searchParams.set('message', env.SMS_OTP_TEMPLATE.replace(/{#(?:num|var)#}|{otp}/, otp));
  if (env.SMS_TEMPLATE_ID) url.searchParams.set('templateid', env.SMS_TEMPLATE_ID);

  let res;
  try {
    res = await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (err) {
    logger.error({ err: err.name === 'TimeoutError' ? 'timeout' : err.message }, 'SMS provider request failed');
    return { ok: false, response: err.name === 'TimeoutError' ? 'timeout' : 'network_error' };
  }
  const text = (await res.text().catch(() => '')).split(otp).join('******').slice(0, 300);
  if (!res.ok) logger.error({ status: res.status, body: text, number: `******${providerNumber(mobile).slice(-4)}` }, 'SMS provider returned an error');
  else logger.info({ status: res.status, body: text, number: `******${providerNumber(mobile).slice(-4)}` }, 'SMS provider response');
  return { ok: res.ok, response: `${res.status} ${text}`.trim() };
}

const hashOtp = (attemptId, otp) => hmacSha256(env.OTP_SECRET, `${attemptId}:${otp}`);

/** Enforce per-mobile resend cooldown and hourly send cap (in addition to per-IP rate limits). */
async function assertCanSend(mobile) {
  const last = await otpRepo.lastSendAt(mobile);
  if (last) {
    const elapsed = (Date.now() - new Date(last.created_at).getTime()) / 1000;
    if (elapsed < env.OTP_RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(env.OTP_RESEND_COOLDOWN_SECONDS - elapsed);
      const e = tooMany(`Please wait ${wait}s before requesting another code`, 'OTP_COOLDOWN');
      e.details = { retryAfter: wait };
      throw e;
    }
  }
  if ((await otpRepo.countRecentSends(mobile, 60)) >= env.OTP_MAX_SENDS_PER_HOUR) {
    throw tooMany('Too many codes requested for this number. Try again later.', 'OTP_SEND_LIMIT');
  }
}

export const otpService = {
  /** Generate, persist (hashed) and send an OTP for a challenge. Returns { expiresIn, resendIn }. */
  async issue({ challengeId, userId, mobile, purpose, ip }) {
    await assertCanSend(mobile);
    await otpRepo.supersedeForChallenge(challengeId);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
    const id = await otpRepo.create({ challengeId, userId, mobile, purpose, expiresAt, maxAttempts: env.OTP_MAX_ATTEMPTS, ip });
    const otp = randomDigits(env.OTP_LENGTH);
    await otpRepo.setHash(id, hashOtp(id, otp));
    const result = await sendSms(mobile, otp);
    await otpRepo.markSendResult(id, result.ok, result.response);
    if (!result.ok) {
      throw new AppError('We could not send the verification code. Please try again shortly.', { status: 502, errorCode: 'OTP_SEND_FAILED' });
    }
    return { expiresIn: env.OTP_TTL_SECONDS, resendIn: env.OTP_RESEND_COOLDOWN_SECONDS };
  },

  /** Verify the latest OTP for a challenge. Enforces expiry and attempt limits. Returns the attempt row. */
  async verify({ challengeId, otp }) {
    const attempt = await otpRepo.latestForChallenge(challengeId);
    const invalid = () => new AppError('Invalid or expired code', { status: 400, errorCode: 'OTP_INVALID' });
    if (!attempt) throw invalid();
    if (new Date(attempt.expires_at).getTime() < Date.now()) {
      await otpRepo.markExpired(attempt.id);
      throw new AppError('This code has expired. Request a new one.', { status: 400, errorCode: 'OTP_EXPIRED' });
    }
    if (attempt.attempts >= attempt.max_attempts) {
      throw tooMany('Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED');
    }
    const candidate = String(otp || '').replace(/\D/g, '');
    if (!candidate || !safeEqual(hashOtp(attempt.id, candidate), attempt.otp_hash)) {
      await otpRepo.incrementAttempts(attempt.id);
      throw invalid();
    }
    return attempt;
  },
};
