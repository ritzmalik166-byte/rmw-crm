import { env } from '../config/env.js';
import { sessionRepo, deviceRepo } from '../repositories/authRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { settingsService } from '../services/settingsService.js';
import { cookies } from '../services/auth/cookies.js';
import { sha256 } from '../utils/crypto.js';
import { unauthorized, forbidden } from '../utils/errors.js';
import { audit } from '../services/auditService.js';

const TOUCH_INTERVAL_MS = 60_000;

export async function authenticate(req, res, next) {
  try {
    const token = cookies.read(req, env.SESSION_COOKIE_NAME);
    if (!token) throw unauthorized();
    const session = await sessionRepo.findActiveByToken(sha256(token));
    if (!session) { cookies.clearSession(res); throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED'); }

    const idleMinutes = await settingsService.get('auth.session_idle_minutes');
    if (Date.now() - new Date(session.last_activity_at).getTime() > idleMinutes * 60_000) {
      await sessionRepo.revoke(session.id, 'IDLE_TIMEOUT');
      await audit('SESSION_REVOKED', { actorId: session.user_id, entityType: 'session', entityId: session.id, req, meta: { reason: 'IDLE_TIMEOUT' } });
      cookies.clearSession(res);
      throw unauthorized('Your session timed out. Please sign in again.', 'SESSION_EXPIRED');
    }
    if (session.user_status !== 'ACTIVE') {
      await sessionRepo.revoke(session.id, `USER_${session.user_status}`);
      cookies.clearSession(res);
      throw unauthorized('Your account is not active', `ACCOUNT_${session.user_status}`);
    }

    const [user, ctx] = await Promise.all([userRepo.findById(session.user_id), userRepo.loadAuthContext(session.user_id)]);
    req.auth = { user, session, ctx };

    if (Date.now() - new Date(session.last_activity_at).getTime() > TOUCH_INTERVAL_MS) {
      sessionRepo.touch(session.id).catch(() => {});
      if (session.device_id) deviceRepo.touch(session.device_id).catch(() => {});
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

export const requirePermission = (...perms) => (req, _res, next) => {
  const p = req.auth?.ctx?.permissions;
  if (!p) return next(unauthorized());
  return perms.every((x) => p.has(x)) ? next() : next(forbidden());
};

export const requireAnyPermission = (...perms) => (req, _res, next) => {
  const p = req.auth?.ctx?.permissions;
  if (!p) return next(unauthorized());
  return perms.some((x) => p.has(x)) ? next() : next(forbidden());

  
};

export const requireArea = (area) => requirePermission(`area.${area}`);
