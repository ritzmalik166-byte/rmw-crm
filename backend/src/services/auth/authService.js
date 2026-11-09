import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { transaction, query } from '../../config/db.js';
import { userRepo } from '../../repositories/userRepo.js';
import { sessionRepo, deviceRepo, challengeRepo, resetTokenRepo, otpRepo } from '../../repositories/authRepo.js';
import { otpService } from './otpService.js';
import { cookies } from './cookies.js';
import { audit } from '../auditService.js';
import { settingsService } from '../settingsService.js';
import { notificationService } from '../../notifications/notificationService.js';
import { emailService } from '../../notifications/emailService.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { describeDevice } from '../../utils/device.js';
import { maskMobile } from '../../utils/normalize.js';
import { clientIp } from '../../utils/http.js';
import { AppError, unauthorized, conflict, badRequest, forbidden } from '../../utils/errors.js';

const BCRYPT_ROUNDS = 12;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
// Pre-computed hash so unknown-email logins take the same time as known ones (no user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', BCRYPT_ROUNDS);

const STATUS_MESSAGES = {
  PENDING_APPROVAL: 'Your account is awaiting Super Admin approval.',
  REJECTED: 'Your account request was not approved.',
  DISABLED: 'Your account has been disabled. Contact your administrator.',
  SUSPENDED: 'Your account is suspended. Contact your administrator.',
};

function assertActive(user) {
  if (user.status !== 'ACTIVE') {
    throw new AppError(STATUS_MESSAGES[user.status] || 'Account is not active', { status: 403, errorCode: `ACCOUNT_${user.status}` });
  }
}

/** Returns the raw device token from the cookie, creating and setting one if absent. */
function ensureDeviceToken(req, res) {
  let token = cookies.read(req, env.DEVICE_COOKIE_NAME);
  if (!token || token.length < 32 || token.length > 128) {
    token = randomToken(32);
    cookies.setDevice(res, token);
  }
  return token;
}

async function isTrustedDevice(userId, deviceHash) {
  const d = await deviceRepo.find(userId, deviceHash);
  return Boolean(d && d.is_trusted && !d.revoked_at && d.trusted_until && new Date(d.trusted_until) > new Date());
}

async function createSession(req, res, { user, deviceHash, authMethod, otpVerified, trustDays = 0 }) {
  const info = describeDevice(req.get('user-agent'));
  const device = await deviceRepo.upsert({ userId: user.id, deviceHash, deviceName: info.deviceName, browser: info.browser, os: info.os, ip: clientIp(req) });
  if (trustDays > 0) {
    await deviceRepo.trust(device.id, new Date(Date.now() + trustDays * 86400_000));
    await audit('DEVICE_TRUSTED', { actorId: user.id, entityType: 'device', entityId: device.id, req, meta: { days: trustDays, ...info } });
  }
  const absoluteDays = await settingsService.get('auth.session_absolute_days');
  const maxAgeMs = absoluteDays * 86400_000;
  const token = randomToken(32);
  const sessionId = await sessionRepo.create({
    userId: user.id, deviceId: device.id, tokenHash: sha256(token), ip: clientIp(req), userAgent: req.get('user-agent'),
    authMethod, otpVerified, expiresAt: new Date(Date.now() + maxAgeMs),
  });
  cookies.setSession(res, token, maxAgeMs);
  cookies.clearChallenge(res);
  await userRepo.touchLogin(user.id);
  await audit('SESSION_CREATED', { actorId: user.id, entityType: 'session', entityId: sessionId, req, meta: { authMethod, ...info } });
  await audit('LOGIN_SUCCESS', { actorId: user.id, entityType: 'user', entityId: user.id, req, meta: { authMethod } });
  return sessionId;
}

async function startChallenge(req, res, { user, purpose, deviceHash }) {
  const token = randomToken(32);
  const challengeId = await challengeRepo.create({
    userId: user.id, purpose, tokenHash: sha256(token), deviceHash, ip: clientIp(req), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  cookies.setChallenge(res, token);
  const sent = await otpService.issue({ challengeId, userId: user.id, mobile: user.mobile, purpose, ip: clientIp(req) });
  await audit('OTP_REQUESTED', { actorId: user.id, entityType: 'user', entityId: user.id, req, meta: { purpose } });
  return { challengeId, ...sent };
}

export const authService = {
  async registerRequest(req, data) {
    const existing = await userRepo.existsEmailOrMobile(data.email, data.mobile);
    if (existing) throw conflict('An account with this email or mobile already exists', 'ACCOUNT_EXISTS');
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const { userId, requestId } = await transaction(async (conn) => {
      const id = await userRepo.create({ fullName: data.fullName, email: data.email, mobile: data.mobile, passwordHash, departmentId: data.departmentId || null }, conn);
      const [r] = await conn.query(
        'INSERT INTO user_registration_requests (user_id, requested_department_id, requested_team_id, requested_website_ids, notes) VALUES (?, ?, ?, ?, ?)',
        [id, data.departmentId || null, data.teamId || null, JSON.stringify(data.websiteIds || []), data.notes || null],
      );
      return { userId: id, requestId: r.insertId };
    });
    await audit('ACCOUNT_REQUESTED', { actorId: userId, entityType: 'registration_request', entityId: requestId, req });
    const admins = await userRepo.usersWithPermission('user.approve');
    await notificationService.notifyMany(admins.map((a) => a.id), {
      type: 'ACCOUNT_REQUEST', title: 'New account request', body: `${data.fullName} (${data.email}) requested CRM access.`,
      link: '/super-admin/user-requests',
    });
    return { requestId };
  },

  /** Step 1 of email/password login. Either creates a session (trusted device) or starts new-device OTP. */
  async loginWithPassword(req, res, { email, password }) {
    const user = await userRepo.findAuthByEmail(email);
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) {
      await audit('LOGIN_FAILED', { actorId: user?.id || null, req, meta: { method: 'PASSWORD', reason: 'bad_credentials' } });
      throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (user.status !== 'ACTIVE') {
      await audit('LOGIN_FAILED', { actorId: user.id, req, meta: { method: 'PASSWORD', reason: `status_${user.status}` } });
      assertActive(user);
    }
    const deviceToken = ensureDeviceToken(req, res);
    const deviceHash = sha256(deviceToken);
    if (await isTrustedDevice(user.id, deviceHash)) {
      await createSession(req, res, { user, deviceHash, authMethod: 'PASSWORD', otpVerified: false });
      return { requiresOtp: false };
    }
    await audit('NEW_DEVICE_DETECTED', { actorId: user.id, entityType: 'user', entityId: user.id, req, meta: describeDevice(req.get('user-agent')) });
    const sent = await startChallenge(req, res, { user, purpose: 'NEW_DEVICE', deviceHash });
    return { requiresOtp: true, reason: 'NEW_DEVICE', maskedMobile: maskMobile(user.mobile), expiresIn: sent.expiresIn, resendIn: sent.resendIn };
  },

  /** Mobile OTP login, step 1. Always answers the same way, so registered numbers cannot be discovered. */
  async requestLoginOtp(req, res, { mobile }) {
    const user = await userRepo.findAuthByMobile(mobile);
    const generic = { maskedMobile: maskMobile(mobile), expiresIn: env.OTP_TTL_SECONDS, resendIn: env.OTP_RESEND_COOLDOWN_SECONDS };
    if (!user || user.status !== 'ACTIVE') {
      await audit('OTP_REQUESTED', { actorId: user?.id || null, req, meta: { purpose: 'LOGIN_OTP', outcome: user ? `status_${user.status}` : 'unknown_mobile' } });
      cookies.setChallenge(res, randomToken(32)); // decoy, never stored
      return generic;
    }
    const deviceHash = sha256(ensureDeviceToken(req, res));
    const sent = await startChallenge(req, res, { user, purpose: 'LOGIN_OTP', deviceHash });
    return { ...generic, expiresIn: sent.expiresIn, resendIn: sent.resendIn };
  },

  async resendOtp(req) {
    const challenge = await challengeRepo.findActive(sha256(cookies.read(req, env.CHALLENGE_COOKIE_NAME) || ''));
    if (!challenge) return { expiresIn: env.OTP_TTL_SECONDS, resendIn: env.OTP_RESEND_COOLDOWN_SECONDS }; // decoy / expired
    const user = await userRepo.findAuthById(challenge.user_id);
    assertActive(user);
    const sent = await otpService.issue({ challengeId: challenge.id, userId: user.id, mobile: user.mobile, purpose: challenge.purpose, ip: clientIp(req) });
    await audit('OTP_REQUESTED', { actorId: user.id, req, meta: { purpose: challenge.purpose, resend: true } });
    return sent;
  },

  /** Step 2 for both OTP login and new-device verification. */
  async verifyOtp(req, res, { otp, trustDevice, trustDays }) {
    const challenge = await challengeRepo.findActive(sha256(cookies.read(req, env.CHALLENGE_COOKIE_NAME) || ''));
    if (!challenge) throw new AppError('Your verification session expired. Please sign in again.', { status: 400, errorCode: 'CHALLENGE_EXPIRED' });
    let attempt;
    try {
      attempt = await otpService.verify({ challengeId: challenge.id, otp });
    } catch (err) {
      await audit('OTP_FAILED', { actorId: challenge.user_id, req, meta: { purpose: challenge.purpose, reason: err.errorCode } });
      throw err;
    }
    const consumed = await transaction(async (conn) => {
      const [r] = await conn.query('UPDATE auth_challenges SET consumed_at = NOW(3) WHERE id = ? AND consumed_at IS NULL', [challenge.id]);
      if (!r.affectedRows) return false; // already used in a parallel request
      await otpRepo.markVerified(attempt.id, conn);
      return true;
    });
    if (!consumed) throw new AppError('This code was already used', { status: 400, errorCode: 'OTP_INVALID' });
    await audit('OTP_VERIFIED', { actorId: challenge.user_id, req, meta: { purpose: challenge.purpose } });

    const user = await userRepo.findAuthById(challenge.user_id);
    assertActive(user); // status may have changed during the challenge

    let days = 0;
    if (trustDevice) {
      const options = await settingsService.get('auth.trusted_device_days_options');
      days = options.includes(trustDays) ? trustDays : await settingsService.get('auth.trusted_device_default_days');
    }
    const deviceHash = challenge.device_hash || sha256(ensureDeviceToken(req, res));
    await createSession(req, res, {
      user, deviceHash, authMethod: challenge.purpose === 'NEW_DEVICE' ? 'PASSWORD_OTP' : 'OTP', otpVerified: true, trustDays: days,
    });
    return { trusted: days > 0, trustedDays: days };
  },

  /** Trust the current device after the fact; allowed only within 15 minutes of an OTP-verified sign-in. */
  async trustCurrentDevice(req, { days }) {
    const s = req.auth.session;
    if (!s.otp_verified_at || Date.now() - new Date(s.otp_verified_at).getTime() > 15 * 60_000) {
      throw forbidden('Verify with OTP again to trust this device', 'OTP_REQUIRED');
    }
    const options = await settingsService.get('auth.trusted_device_days_options');
    if (!options.includes(days)) throw badRequest('Unsupported trust period');
    await deviceRepo.trust(s.device_id, new Date(Date.now() + days * 86400_000));
    await audit('DEVICE_TRUSTED', { actorId: req.auth.user.id, entityType: 'device', entityId: s.device_id, req, meta: { days } });
  },

  async logout(req, res) {
    if (req.auth?.session) {
      await sessionRepo.revoke(req.auth.session.id, 'LOGOUT');
      await audit('LOGOUT', { actorId: req.auth.user.id, entityType: 'session', entityId: req.auth.session.id, req });
    }
    cookies.clearSession(res);
  },

  async listSessions(req) {
    const rows = await sessionRepo.listActiveForUser(req.auth.user.id);
    return rows.map((r) => ({ ...r, current: r.id === req.auth.session.id }));
  },

  async revokeOwnSession(req, sessionId) {
    const s = await sessionRepo.findById(sessionId);
    if (!s || s.user_id !== req.auth.user.id) throw new AppError('Session not found', { status: 404, errorCode: 'NOT_FOUND' });
    await sessionRepo.revoke(s.id, 'USER_REVOKED', req.auth.user.id);
    if (s.device_id) await deviceRepo.untrust(s.device_id);
    await audit('SESSION_REVOKED', { actorId: req.auth.user.id, entityType: 'session', entityId: s.id, req });
    await audit('DEVICE_REVOKED', { actorId: req.auth.user.id, entityType: 'device', entityId: s.device_id, req });
    notificationService.forceLogout(s.id);
  },

  async logoutAllOthers(req) {
    const { user, session } = req.auth;
    const others = (await sessionRepo.listActiveForUser(user.id)).filter((s) => s.id !== session.id);
    await sessionRepo.revokeAllForUser(user.id, 'LOGOUT_ALL', { exceptId: session.id, by: user.id });
    await query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL WHERE user_id = ? AND id <> ?', [user.id, session.device_id]);
    others.forEach((s) => notificationService.forceLogout(s.id));
    await audit('LOGOUT_ALL_DEVICES', { actorId: user.id, entityType: 'user', entityId: user.id, req, meta: { revoked: others.length } });
    return { revoked: others.length };
  },

  /** Always responds identically; a reset email is sent only for existing active accounts. */
  async forgotPassword(req, { email }) {
    const user = await userRepo.findAuthByEmail(email);
    if (!user || user.status !== 'ACTIVE') return;
    const token = randomToken(32);
    const ttl = await settingsService.get('auth.password_reset_ttl_minutes');
    await resetTokenRepo.invalidateAllForUser(user.id);
    await resetTokenRepo.create({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl * 60_000), ip: clientIp(req) });
    await emailService.send('passwordReset', { to: user.email, name: user.full_name, link: `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`, minutes: ttl });
    await audit('PASSWORD_RESET', { actorId: user.id, entityType: 'user', entityId: user.id, req, meta: { stage: 'requested' } });
  },

  async resetPassword(req, { token, password }) {
    const row = await resetTokenRepo.findValid(sha256(token));
    if (!row) throw badRequest('This reset link is invalid or has expired', 'RESET_TOKEN_INVALID');
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await transaction(async (conn) => {
      const [r] = await conn.query('UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [row.id]);
      if (!r.affectedRows) throw badRequest('This reset link was already used', 'RESET_TOKEN_INVALID');
      await userRepo.setPassword(row.user_id, hash, conn);
      await resetTokenRepo.invalidateAllForUser(row.user_id, conn);
      // A password reset signs out every session and removes device trust.
      await conn.query("UPDATE sessions SET revoked_at = NOW(3), revoked_reason = 'PASSWORD_RESET' WHERE user_id = ? AND revoked_at IS NULL", [row.user_id]);
      await conn.query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL WHERE user_id = ?', [row.user_id]);
    });
    await audit('PASSWORD_RESET', { actorId: row.user_id, entityType: 'user', entityId: row.user_id, req, meta: { stage: 'completed' } });
  },

  async changePassword(req, { currentPassword, newPassword }) {
    const user = await userRepo.findAuthById(req.auth.user.id);
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
    await userRepo.setPassword(user.id, await bcrypt.hash(newPassword, BCRYPT_ROUNDS));
    await sessionRepo.revokeAllForUser(user.id, 'PASSWORD_CHANGED', { exceptId: req.auth.session.id, by: user.id });
    await audit('PASSWORD_CHANGED', { actorId: user.id, entityType: 'user', entityId: user.id, req });
  },

  hashPassword: (pw) => bcrypt.hash(pw, BCRYPT_ROUNDS),
};
