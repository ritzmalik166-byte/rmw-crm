import { query, one, transaction } from '../config/db.js';
import { userRepo } from '../repositories/userRepo.js';
import { sessionRepo } from '../repositories/authRepo.js';
import { audit } from './auditService.js';
import { authService } from './auth/authService.js';
import { emailService } from '../notifications/emailService.js';
import { notificationService } from '../notifications/notificationService.js';
import { forbidden, notFound, badRequest, conflict } from '../utils/errors.js';
import { OWNER_ONLY_PERMISSIONS } from '../config/rbac.js';

async function rolesByIds(ids) {
  if (!ids?.length) return [];
  return query('SELECT id, code, level FROM roles WHERE id IN (?)', [ids]);
}

/** A caller may only grant roles strictly below their own level (Super Admin may grant any role). */
async function assertCanGrant(req, roleIds) {
  const roles = await rolesByIds(roleIds);
  if (roles.length !== roleIds.length) throw badRequest('Unknown role');
  if (req.auth.ctx.isOwner) return roles;
  if (roles.some((r) => r.code === 'OWNER')) throw forbidden('Only the Owner can grant the Owner role', 'ROLE_FORBIDDEN');
  if (req.auth.ctx.isSuperAdmin) return roles;
  if (roles.some((r) => r.level >= req.auth.ctx.roleLevel)) throw forbidden('You cannot grant this role', 'ROLE_FORBIDDEN');
  return roles;
}

/**
 * A caller may only manage users whose highest role is below their own. Super Admin manages everyone except the Owner;
 * the Owner manages everyone. Nobody manages their own account here. Only the Owner touches a BLOCKED account.
 */
async function assertCanManage(req, targetId) {
  if (targetId === req.auth.user.id) throw forbidden('Use your own settings page to change your account', 'SELF_MANAGE');
  if (req.auth.ctx.isOwner) return;
  const [target, row] = await Promise.all([userRepo.loadAuthContext(targetId), userRepo.findById(targetId)]);
  if (!row) throw notFound('User not found');
  if (target.isOwner) throw forbidden('The Owner account can only be managed by the Owner', 'USER_FORBIDDEN');
  if (row.status === 'BLOCKED') throw forbidden('This account is blocked. Only the Owner can change it.', 'USER_BLOCKED');
  if (req.auth.ctx.isSuperAdmin) return;
  if (target.roleLevel >= req.auth.ctx.roleLevel) throw forbidden('You cannot manage this user', 'USER_FORBIDDEN');
}

export const userAdminService = {
  async listRequests({ status, limit, offset }) {
    const where = status ? 'r.status = ?' : '1=1';
    const params = status ? [status] : [];
    const [{ total }] = await query(`SELECT COUNT(*) total FROM user_registration_requests r WHERE ${where}`, params);
    const rows = await query(
      `SELECT r.*, u.full_name, u.email, u.mobile, d.name AS requested_department, t.name AS requested_team, rv.full_name AS reviewer_name
       FROM user_registration_requests r JOIN users u ON u.id = r.user_id
       LEFT JOIN departments d ON d.id = r.requested_department_id LEFT JOIN teams t ON t.id = r.requested_team_id
       LEFT JOIN users rv ON rv.id = r.reviewed_by
       WHERE ${where} ORDER BY r.status = 'PENDING_APPROVAL' DESC, r.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    const websites = await query('SELECT id, code FROM websites');
    const codeOf = Object.fromEntries(websites.map((w) => [w.id, w.code]));
    return {
      total,
      rows: rows.map((r) => {
        const ids = typeof r.requested_website_ids === 'string' ? JSON.parse(r.requested_website_ids) : r.requested_website_ids || [];
        return { ...r, requested_website_ids: ids, requested_websites: ids.map((i) => codeOf[i]).filter(Boolean) };
      }),
    };
  },

  async approve(req, requestId, { roleId, departmentId, teamIds = [], websiteIds = [] }) {
    const r = await one('SELECT * FROM user_registration_requests WHERE id = ?', [requestId]);
    if (!r) throw notFound('Request not found');
    if (r.status !== 'PENDING_APPROVAL') throw conflict('This request was already reviewed', 'ALREADY_REVIEWED');
    const [role] = await assertCanGrant(req, [roleId]);
    const user = await userRepo.findById(r.user_id);
    await transaction(async (conn) => {
      await conn.query("UPDATE user_registration_requests SET status = 'APPROVED', reviewed_by = ?, reviewed_at = NOW(3) WHERE id = ?", [req.auth.user.id, requestId]);
      await userRepo.update(user.id, { status: 'ACTIVE', departmentId: departmentId || null }, conn);
      await userRepo.setRoles(user.id, [roleId], conn);
      await userRepo.setWebsites(user.id, websiteIds, conn);
      await userRepo.setTeams(user.id, teamIds, conn);
    });
    await audit('ACCOUNT_APPROVED', { actorId: req.auth.user.id, entityType: 'user', entityId: user.id, req, meta: { role: role.code, websiteIds, teamIds, departmentId } });
    await emailService.send('accountApproved', { to: user.email, name: user.full_name });
  },

  async reject(req, requestId, { reason }) {
    const r = await one('SELECT * FROM user_registration_requests WHERE id = ?', [requestId]);
    if (!r) throw notFound('Request not found');
    if (r.status !== 'PENDING_APPROVAL') throw conflict('This request was already reviewed', 'ALREADY_REVIEWED');
    const user = await userRepo.findById(r.user_id);
    await transaction(async (conn) => {
      await conn.query("UPDATE user_registration_requests SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(3), rejection_reason = ? WHERE id = ?", [req.auth.user.id, reason || null, requestId]);
      await userRepo.update(user.id, { status: 'REJECTED' }, conn);
    });
    await audit('ACCOUNT_REJECTED', { actorId: req.auth.user.id, entityType: 'user', entityId: user.id, req, meta: { reason } });
    await emailService.send('accountRejected', { to: user.email, name: user.full_name, reason });
  },

  list: (f) => userRepo.list(f),

  async get(id) {
    const user = await userRepo.findById(id);
    if (!user) throw notFound('User not found');
    const ctx = await userRepo.loadAuthContext(id);
    const roles = await query('SELECT r.id, r.code, r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [id]);
    const websites = await query('SELECT website_id FROM user_website_access WHERE user_id = ?', [id]);
    return { ...user, roles, roleIds: roles.map((r) => r.id), websiteIds: websites.map((w) => w.website_id), teams: ctx.teams, teamIds: ctx.teams.map((t) => t.id) };
  },

  async create(req, data) {
    await assertCanGrant(req, [data.roleId]);
    if (await userRepo.existsEmailOrMobile(data.email, data.mobile)) throw conflict('Email or mobile already in use', 'ACCOUNT_EXISTS');
    const hash = await authService.hashPassword(data.password);
    const id = await transaction(async (conn) => {
      const uid = await userRepo.create({ fullName: data.fullName, email: data.email, mobile: data.mobile, passwordHash: hash, status: 'ACTIVE', departmentId: data.departmentId || null }, conn);
      await userRepo.setRoles(uid, [data.roleId], conn);
      await userRepo.setWebsites(uid, data.websiteIds || [], conn);
      await userRepo.setTeams(uid, data.teamIds || [], conn);
      return uid;
    });
    await audit('USER_CREATED', { actorId: req.auth.user.id, entityType: 'user', entityId: id, req, meta: { roleId: data.roleId, websiteIds: data.websiteIds } });
    return { id };
  },

  async update(req, id, data) {
    await assertCanManage(req, id);
    const before = await userAdminService.get(id);
    if (data.roleId) await assertCanGrant(req, [data.roleId]);
    if (data.newPassword && !req.auth.ctx.isSuperAdmin) throw forbidden('Only a Super Admin can set a user password', 'PASSWORD_FORBIDDEN');
    const newHash = data.newPassword ? await authService.hashPassword(data.newPassword) : null;
    await transaction(async (conn) => {
      await userRepo.update(id, { fullName: data.fullName, avatar: data.avatar, departmentId: data.departmentId }, conn);
      if (data.roleId) await userRepo.setRoles(id, [data.roleId], conn);
      if (data.websiteIds) await userRepo.setWebsites(id, data.websiteIds, conn);
      if (data.teamIds) await userRepo.setTeams(id, data.teamIds, conn);
      if (newHash) await userRepo.setPassword(id, newHash, conn);
    });
    await audit('USER_UPDATED', { actorId: req.auth.user.id, entityType: 'user', entityId: id, req, meta: { fields: Object.keys(data).filter((k) => k !== 'newPassword') } });
    if (newHash) {
      const sessions = await sessionRepo.listActiveForUser(id);
      await sessionRepo.revokeAllForUser(id, 'PASSWORD_RESET_BY_ADMIN', { by: req.auth.user.id });
      sessions.forEach((s) => notificationService.forceLogout(s.id));
      await audit('PASSWORD_RESET', { actorId: req.auth.user.id, entityType: 'user', entityId: id, req, meta: { byAdmin: true } });
    }
    if (data.roleId && !before.roleIds.includes(data.roleId)) {
      await audit('ROLE_CHANGED', { actorId: req.auth.user.id, entityType: 'user', entityId: id, req, meta: { from: before.roleIds, to: [data.roleId] } });
    }
  },

  async setStatus(req, id, { status, reason }) {
    await assertCanManage(req, id);
    if (!['ACTIVE', 'DISABLED', 'SUSPENDED', 'BLOCKED'].includes(status)) throw badRequest('Invalid status');
    const before = await userRepo.findById(id);
    if (!before) throw notFound('User not found');
    const blocking = status === 'BLOCKED';
    const unblocking = before.status === 'BLOCKED' && status !== 'BLOCKED';
    if ((blocking || unblocking) && !req.auth.ctx.permissions.has('user.block')) {
      throw forbidden('Only the Owner can block or unblock accounts', 'BLOCK_FORBIDDEN');
    }
    if (blocking && !reason?.trim()) throw badRequest('A reason is required to block an account');
    await userRepo.update(id, { status });
    if (status !== 'ACTIVE') {
      const sessions = await sessionRepo.listActiveForUser(id);
      await sessionRepo.revokeAllForUser(id, `USER_${status}`, { by: req.auth.user.id });
      // A blocked account also loses every trusted device, so an unblock always starts with a fresh OTP login.
      if (blocking) await query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL WHERE user_id = ?', [id]);
      sessions.forEach((s) => notificationService.forceLogout(s.id));
    }
    const action = blocking ? 'ACCOUNT_BLOCKED' : unblocking ? 'ACCOUNT_UNBLOCKED' : status === 'ACTIVE' ? 'ACCOUNT_ENABLED' : 'ACCOUNT_DISABLED';
    await audit(action, { actorId: req.auth.user.id, entityType: 'user', entityId: id, req, meta: { status, from: before.status, reason } });
  },

  /** Guard for admin actions on another user's sessions: nobody but the Owner can sign the Owner out. */
  async assertCanTouchSessions(req, targetUserId) {
    if (req.auth.ctx.isOwner || targetUserId === req.auth.user.id) return;
    const target = await userRepo.loadAuthContext(targetUserId);
    if (target.isOwner) throw forbidden('Only the Owner can end the Owner sessions', 'USER_FORBIDDEN');
  },

  roles: () => query(
    `SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count,
       (SELECT JSON_ARRAYAGG(p.code) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = r.id) AS permissions
     FROM roles r ORDER BY r.level DESC`,
  ),
  permissions: () => query('SELECT * FROM permissions ORDER BY group_name, code'),

  async createRole(req, { code, name, description, level, permissionCodes }) {
    if (level >= 100) throw badRequest('Level must be below Super Admin');
    const r = await query('INSERT INTO roles (code, name, description, level) VALUES (?, ?, ?, ?)', [code, name, description || null, level]);
    await userAdminService.setRolePermissions(req, r.insertId, permissionCodes || []);
    await audit('ROLE_CREATED', { actorId: req.auth.user.id, entityType: 'role', entityId: r.insertId, req, meta: { code } });
    return { id: r.insertId };
  },

  async setRolePermissions(req, roleId, permissionCodes) {
    const role = await one('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) throw notFound('Role not found');
    if (role.code === 'OWNER') throw badRequest('The Owner always holds every permission');
    if (role.code === 'SUPER_ADMIN') throw badRequest('Super Admin always holds every permission');
    const before = await query('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?', [roleId]);
    await transaction(async (conn) => {
      await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      if (permissionCodes.length) {
        await conn.query('INSERT INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE code IN (?) AND code NOT IN (?)', [roleId, permissionCodes, ['area.super_admin', ...OWNER_ONLY_PERMISSIONS]]);
      }
    });
    await audit('PERMISSION_CHANGED', {
      actorId: req.auth.user.id, entityType: 'role', entityId: roleId, req,
      meta: { role: role.code, before: before.map((b) => b.code), after: permissionCodes.filter((c) => c !== 'area.super_admin' && !OWNER_ONLY_PERMISSIONS.includes(c)) },
    });
  },
};
