import { query, one } from '../config/db.js';

export const sessionRepo = {
  async create({ userId, deviceId, tokenHash, ip, userAgent, authMethod, otpVerified, expiresAt }) {
    const res = await query(
      `INSERT INTO sessions (user_id, device_id, token_hash, ip_address, user_agent, auth_method, otp_verified_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ${otpVerified ? 'NOW(3)' : 'NULL'}, ?)`,
      [userId, deviceId, tokenHash, ip, userAgent?.slice(0, 500) || null, authMethod, expiresAt],
    );
    return res.insertId;
  },
  findActiveByToken: (tokenHash) => one(
    `SELECT s.*, u.status AS user_status FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(3)`, [tokenHash],
  ),
  touch: (id) => query('UPDATE sessions SET last_activity_at = NOW(3) WHERE id = ?', [id]),
  findById: (id) => one('SELECT * FROM sessions WHERE id = ?', [id]),
  revoke: (id, reason, by = null) => query(
    'UPDATE sessions SET revoked_at = NOW(3), revoked_reason = ?, revoked_by = ? WHERE id = ? AND revoked_at IS NULL', [reason, by, id],
  ),
  revokeAllForUser: (userId, reason, { exceptId = null, by = null } = {}) => query(
    'UPDATE sessions SET revoked_at = NOW(3), revoked_reason = ?, revoked_by = ? WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR id <> ?)',
    [reason, by, userId, exceptId, exceptId],
  ),
  listActiveForUser: (userId) => query(
    `SELECT s.id, s.ip_address, s.auth_method, s.created_at, s.last_activity_at, s.expires_at,
            d.device_name, d.browser, d.operating_system, d.is_trusted, d.trusted_until
     FROM sessions s LEFT JOIN user_devices d ON d.id = s.device_id
     WHERE s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(3)
     ORDER BY s.last_activity_at DESC`, [userId],
  ),
  async listAllActive({ search, limit, offset }) {
    const params = []; let where = 's.revoked_at IS NULL AND s.expires_at > NOW(3)';
    if (search) { where += ' AND (u.full_name LIKE ? OR u.email LIKE ? OR s.ip_address LIKE ?)'; const q = `%${search}%`; params.push(q, q, q); }
    const [{ total }] = await query(`SELECT COUNT(*) total FROM sessions s JOIN users u ON u.id = s.user_id WHERE ${where}`, params);
    const rows = await query(
      `SELECT s.id, s.user_id, u.full_name, u.email, s.ip_address, s.auth_method, s.created_at, s.last_activity_at, s.expires_at,
              d.device_name, d.browser, d.operating_system, d.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN user_devices d ON d.id = s.device_id
       WHERE ${where} ORDER BY s.last_activity_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },
};

export const deviceRepo = {
  find: (userId, deviceHash) => one('SELECT * FROM user_devices WHERE user_id = ? AND device_hash = ?', [userId, deviceHash]),
  async upsert({ userId, deviceHash, deviceName, browser, os, ip }) {
    await query(
      `INSERT INTO user_devices (user_id, device_hash, device_name, browser, operating_system, ip_address, last_login_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE device_name = VALUES(device_name), browser = VALUES(browser), operating_system = VALUES(operating_system),
         ip_address = VALUES(ip_address), last_login_at = NOW(3), last_seen_at = NOW(3), revoked_at = NULL`,
      [userId, deviceHash, deviceName, browser, os, ip],
    );
    return deviceRepo.find(userId, deviceHash);
  },
  trust: (id, until) => query('UPDATE user_devices SET is_trusted = 1, trusted_until = ? WHERE id = ?', [until, id]),
  untrust: (id) => query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL, revoked_at = NOW(3) WHERE id = ?', [id]),
  untrustAllForUser: (userId) => query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL WHERE user_id = ?', [userId]),
  touch: (id, os = null) => query('UPDATE user_devices SET last_seen_at = NOW(3), operating_system = COALESCE(?, operating_system) WHERE id = ?', [os, id]),
};

export const challengeRepo = {
  async create({ userId, purpose, tokenHash, deviceHash, ip, expiresAt }) {
    const res = await query(
      'INSERT INTO auth_challenges (user_id, purpose, token_hash, device_hash, ip_address, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, purpose, tokenHash, deviceHash, ip, expiresAt],
    );
    return res.insertId;
  },
  findActive: (tokenHash) => one('SELECT * FROM auth_challenges WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > NOW(3)', [tokenHash]),
  consume: (id, conn) => query('UPDATE auth_challenges SET consumed_at = NOW(3) WHERE id = ? AND consumed_at IS NULL', [id], conn),
};

export const otpRepo = {
  async create({ challengeId, userId, mobile, purpose, expiresAt, maxAttempts, ip }) {
    const res = await query(
      'INSERT INTO otp_verification_attempts (challenge_id, user_id, mobile, purpose, otp_hash, expires_at, max_attempts, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [challengeId, userId, mobile, purpose, '0'.repeat(64), expiresAt, maxAttempts, ip],
    );
    return res.insertId;
  },
  setHash: (id, hash) => query('UPDATE otp_verification_attempts SET otp_hash = ? WHERE id = ?', [hash, id]),
  markSendResult: (id, ok, providerResponse) => query(
    `UPDATE otp_verification_attempts SET status = ${ok ? "'SENT'" : "'SEND_FAILED'"}, provider_response = ? WHERE id = ?`,
    [providerResponse?.slice(0, 500) || null, id],
  ),
  latestForChallenge: (challengeId) => one(
    "SELECT * FROM otp_verification_attempts WHERE challenge_id = ? AND status IN ('SENT','FAILED') ORDER BY id DESC LIMIT 1", [challengeId],
  ),
  supersedeForChallenge: (challengeId) => query(
    "UPDATE otp_verification_attempts SET status = 'SUPERSEDED' WHERE challenge_id = ? AND status IN ('SENT','FAILED')", [challengeId],
  ),
  incrementAttempts: (id) => query("UPDATE otp_verification_attempts SET attempts = attempts + 1, status = 'FAILED' WHERE id = ?", [id]),
  markVerified: (id, conn) => query(
    "UPDATE otp_verification_attempts SET status = 'VERIFIED', verified_at = NOW(3) WHERE id = ? AND status IN ('SENT','FAILED')", [id], conn,
  ),
  markExpired: (id) => query("UPDATE otp_verification_attempts SET status = 'EXPIRED' WHERE id = ?", [id]),
  async countRecentSends(mobile, minutes) {
    const r = await one(
      "SELECT COUNT(*) c FROM otp_verification_attempts WHERE mobile = ? AND status <> 'SEND_FAILED' AND created_at > (NOW(3) - INTERVAL ? MINUTE)",
      [mobile, minutes],
    );
    return r.c;
  },
  lastSendAt: (mobile) => one(
    "SELECT created_at FROM otp_verification_attempts WHERE mobile = ? AND status <> 'SEND_FAILED' ORDER BY id DESC LIMIT 1", [mobile],
  ),
};

export const resetTokenRepo = {
  create: ({ userId, tokenHash, expiresAt, ip }) => query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address) VALUES (?, ?, ?, ?)', [userId, tokenHash, expiresAt, ip],
  ),
  findValid: (tokenHash) => one('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW(3)', [tokenHash]),
  markUsed: (id, conn) => query('UPDATE password_reset_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [id], conn),
  invalidateAllForUser: (userId, conn) => query('UPDATE password_reset_tokens SET used_at = NOW(3) WHERE user_id = ? AND used_at IS NULL', [userId], conn),
};
