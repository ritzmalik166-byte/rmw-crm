import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { clientIp } from '../utils/http.js';
import { parseBound } from '../utils/dateRange.js';

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

/** Activity-log categories (filter chips in the UI). Each is a SQL predicate on a.action. */
const CATEGORY_SQL = {
  leads: "a.action LIKE 'LEAD\\_%'",
  people: "(a.action LIKE 'USER\\_%' OR a.action LIKE 'ACCOUNT\\_%' OR a.action IN ('ROLE_CHANGED','ROLE_CREATED','PERMISSION_CHANGED') OR a.action LIKE 'TEAM\\_%' OR a.action LIKE 'DEPARTMENT\\_%')",
  security: "(a.action LIKE 'LOGIN\\_%' OR a.action LIKE 'LOGOUT%' OR a.action LIKE 'PASSWORD\\_%' OR a.action LIKE 'DEVICE\\_%' OR a.action = 'NEW_DEVICE_DETECTED' OR a.action = 'SESSION_REVOKED')",
  config: "(a.action IN ('SETTINGS_CHANGED','INTEGRATION_CHANGED','SYSTEM_NOTIFICATION_SENT'))",
  // "What people did": hides the machine noise (OTP round-trips, session rows, unattended integration imports).
  human: "a.actor_user_id IS NOT NULL AND a.action NOT IN ('OTP_REQUESTED','OTP_VERIFIED','SESSION_CREATED')",
};

export async function listAudit({ category, action, actorId, entityType, entityId, from, to, limit, offset }) {
  const where = ['1=1']; const params = [];
  if (category && CATEGORY_SQL[category]) where.push(CATEGORY_SQL[category]);
  if (action) { where.push('a.action = ?'); params.push(action); }
  if (actorId) { where.push('a.actor_user_id = ?'); params.push(actorId); }
  if (entityType) { where.push('a.entity_type = ?'); params.push(entityType); }
  if (entityId) { where.push('a.entity_id = ?'); params.push(String(entityId)); }
  if (from) { where.push('a.created_at >= ?'); params.push(parseBound(from)); }
  if (to) { where.push('a.created_at <= ?'); params.push(parseBound(to, true)); }
  const w = where.join(' AND ');
  const [{ total }] = await query(`SELECT COUNT(*) total FROM audit_logs a WHERE ${w}`, params);
  const rows = await query(
    `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email,
            l.name AS lead_name, l.external_lead_id AS lead_ref, tu.full_name AS target_user_name
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     LEFT JOIN leads l ON a.entity_type = 'lead' AND l.id = a.entity_id
     LEFT JOIN users tu ON a.entity_type = 'user' AND tu.id = a.entity_id
     WHERE ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
  );
  // Resolve user ids referenced inside meta (assignment from/to, session owner) to names, so the UI can say
  // "assigned lead X to Priya" instead of "to: 14".
  const parse = (m) => { try { return typeof m === 'string' ? JSON.parse(m) : m; } catch { return null; } };
  const ids = new Set();
  for (const r of rows) {
    r.meta = parse(r.meta);
    for (const k of ['from', 'to', 'userId']) { const v = r.meta?.[k]; if (Number.isInteger(v) || /^\d+$/.test(String(v ?? ''))) ids.add(Number(v)); }
  }
  if (ids.size) {
    const users = await query(`SELECT id, full_name FROM users WHERE id IN (${[...ids].map(() => '?').join(',')})`, [...ids]);
    const names = Object.fromEntries(users.map((x) => [x.id, x.full_name]));
    for (const r of rows) {
      if (!r.meta) continue;
      const refs = {};
      for (const k of ['from', 'to', 'userId']) { const v = Number(r.meta[k]); if (names[v]) refs[k] = names[v]; }
      if (Object.keys(refs).length) r.user_refs = refs;
    }
  }
  return { total, rows };
}
