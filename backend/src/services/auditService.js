import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { clientIp } from '../utils/http.js';

const FORBIDDEN_KEYS = /pass|otp|token|secret|key|hash/i;

function scrub(meta) {
  if (!meta || typeof meta !== 'object') return meta ?? null;
  const out = Array.isArray(meta) ? [] : {};
  for (const [k, v] of Object.entries(meta)) {
    if (FORBIDDEN_KEYS.test(k)) continue; 
    out[k] = v && typeof v === 'object' ? scrub(v) : v;
  }
  return out;
}

/**
 * Record an audit event. Never throws; an audit failure is logged rather than breaking the user action.
 * @param {string} action e.g. LOGIN_SUCCESS
 */
export async function audit(action, { actorId = null, entityType = null, entityId = null, req = null, meta = null, conn = null } = {}) {
  try {
    await query(
      'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, ip_address, user_agent, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [actorId, action, entityType, entityId != null ? String(entityId) : null, req ? clientIp(req) : null,
        req?.get?.('user-agent')?.slice(0, 500) || null, meta ? JSON.stringify(scrub(meta)) : null],
      conn,
    );
  } catch (err) {
    logger.error({ err: err.message, action }, 'Failed to write audit log');
  }
}

export async function listAudit({ action, actorId, entityType, entityId, from, to, limit, offset }) {
  const where = ['1=1']; const params = [];
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (actorId) { where.push('a.actor_user_id = ?'); params.push(actorId); }
  if (entityType) { where.push('a.entity_type = ?'); params.push(entityType); }
  if (entityId) { where.push('a.entity_id = ?'); params.push(String(entityId)); }
  if (from) { where.push('a.created_at >= ?'); params.push(new Date(from)); }
  if (to) { where.push('a.created_at <= ?'); params.push(new Date(to)); }
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM audit_logs a WHERE ${w}`, params);
  const rows = await query(
    `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
  );
  return { total, rows };
}
