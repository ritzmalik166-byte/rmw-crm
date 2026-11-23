import { query } from '../config/db.js';
import { forbidden } from '../utils/errors.js';
import { presenceSnapshot } from '../realtime/presence.js';
import { ok } from '../utils/http.js';

/** Only the Owner may see who is online and what they are doing. */
export function requireOwner(req, _res, next) {
  return req.auth?.ctx?.isOwner ? next() : next(forbidden('Only the Owner can view live users', 'OWNER_ONLY'));
}

const ROLE_ORDER = { OWNER: 0, SUPER_ADMIN: 1, ADMIN: 2 };
const STATUS_ORDER = { online: 0, idle: 1, offline: 2 };

export const presenceController = {
  /** GET /api/super-admin/presence: every non-rejected user with live status, page, device and last action. */
  async list(_req, res) {
    const users = await query(
      `SELECT u.id, u.full_name, u.email, u.status AS account_status, u.last_login_at,
              GROUP_CONCAT(DISTINCT r.code ORDER BY r.level DESC) AS roles,
              MAX(r.level) AS role_level,
              (SELECT MAX(s.last_activity_at) FROM sessions s WHERE s.user_id = u.id) AS last_activity_at
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.status <> 'REJECTED'
       GROUP BY u.id`,
    );
    const live = presenceSnapshot();
    const rows = users.map((u) => {
      const p = live.get(u.id) || { status: 'offline' };
      const roles = u.roles ? String(u.roles).split(',') : [];
      return {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        accountStatus: u.account_status,
        roles,
        roleLevel: Number(u.role_level) || 0,
        status: p.status,
        platform: p.platform || null,
        page: p.page || null,
        pageTitle: p.title || null,
        connections: p.connections || 0,
        onlineSince: p.onlineSince ? new Date(p.onlineSince).toISOString() : null,
        lastSeenAt: p.lastSeenAt ? new Date(p.lastSeenAt).toISOString() : u.last_activity_at,
        lastLoginAt: u.last_login_at,
        ip: p.ip || null,
        userAgent: p.userAgent || null,
        lastAction: p.lastAction ? { label: p.lastAction.label, at: new Date(p.lastAction.at).toISOString() } : null,
      };
    });
    rows.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      || ((ROLE_ORDER[a.roles[0]] ?? 9) - (ROLE_ORDER[b.roles[0]] ?? 9))
      || String(a.fullName).localeCompare(String(b.fullName)));
    const count = (s) => rows.filter((r) => r.status === s).length;
    ok(res, { rows, summary: { online: count('online'), idle: count('idle'), offline: count('offline'), total: rows.length } });
  },
};
