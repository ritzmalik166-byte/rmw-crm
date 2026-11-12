import { userAdminService } from '../services/userAdminService.js';
import { orgService } from '../services/orgService.js';
import { integrationService } from '../services/integrationService.js';
import { analyticsService } from '../services/analyticsService.js';
import { settingsService } from '../services/settingsService.js';
import { audit, listAudit } from '../services/auditService.js';
import { notificationService } from '../notifications/notificationService.js';
import { sessionRepo } from '../repositories/authRepo.js';
import { userRepo } from '../repositories/userRepo.js';
import { pingDb } from '../config/db.js';
import { redisAvailable } from '../config/redis.js';
import { isOtpProviderConfigured } from '../services/auth/otpService.js';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ok, pageMeta } from '../utils/http.js';
import { notFound, badRequest } from '../utils/errors.js';

const paged = (q) => ({ limit: q.limit, offset: (q.page - 1) * q.limit });
const pid = (req) => Number(req.params.id);

export const adminController = {
  async listRequests(req, res) {
    const q = req.validQuery;
    const { total, rows } = await userAdminService.listRequests({ status: req.query.status || null, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async approve(req, res) { await userAdminService.approve(req, pid(req), req.body); ok(res, null, 'Account approved'); },
  async reject(req, res) { await userAdminService.reject(req, pid(req), req.body); ok(res, null, 'Request rejected'); },

  async listUsers(req, res) {
    const q = req.validQuery;
    const { total, rows } = await userAdminService.list({ ...q, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async getUser(req, res) { ok(res, await userAdminService.get(pid(req))); },
  async createUser(req, res) { ok(res, await userAdminService.create(req, req.body), 'User created', 201); },
  async updateUser(req, res) { await userAdminService.update(req, pid(req), req.body); ok(res, null, 'User updated'); },
  async setUserStatus(req, res) { await userAdminService.setStatus(req, pid(req), req.body); ok(res, null, 'Status updated'); },

  async roles(_req, res) { ok(res, await userAdminService.roles()); },
  async permissions(_req, res) { ok(res, await userAdminService.permissions()); },
  async createRole(req, res) { ok(res, await userAdminService.createRole(req, req.body), 'Role created', 201); },
  async setRolePermissions(req, res) { await userAdminService.setRolePermissions(req, pid(req), req.body.permissionCodes); ok(res, null, 'Permissions updated'); },

  async departments(_req, res) { ok(res, await orgService.departments()); },
  async createDepartment(req, res) { ok(res, await orgService.createDepartment(req, req.body), 'Department created', 201); },
  async updateDepartment(req, res) { await orgService.updateDepartment(req, pid(req), req.body); ok(res, null, 'Department updated'); },
  async deleteDepartment(req, res) { await orgService.deleteDepartment(req, pid(req)); ok(res, null, 'Department deleted'); },
  async teams(_req, res) { ok(res, await orgService.teams()); },
  async teamMembers(req, res) { ok(res, await orgService.teamMembers(pid(req))); },
  async createTeam(req, res) { ok(res, await orgService.createTeam(req, req.body), 'Team created', 201); },
  async updateTeam(req, res) { await orgService.updateTeam(req, pid(req), req.body); ok(res, null, 'Team updated'); },
  async setTeamMembers(req, res) { await orgService.setTeamMembers(req, pid(req), req.body.members); ok(res, null, 'Members updated'); },
  async deleteTeam(req, res) { await orgService.deleteTeam(req, pid(req)); ok(res, null, 'Team deleted'); },
  async websites(_req, res) { ok(res, await orgService.websites()); },
  async updateWebsite(req, res) { await orgService.updateWebsite(req, pid(req), req.body); ok(res, null, 'Website updated'); },
  async createStatus(req, res) { ok(res, await orgService.createStatus(req, req.body), 'Status created', 201); },
  async updateStatus(req, res) { await orgService.updateStatus(req, pid(req), req.body); ok(res, null, 'Status updated'); },

  async integrations(_req, res) { ok(res, await integrationService.health()); },
  async integrationEvents(req, res) {
    const q = req.validQuery;
    const { total, rows } = await integrationService.events({ websiteId: req.query.websiteId || null, status: req.query.status || null, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async retryEvent(req, res) { await integrationService.retryEvent(pid(req), req); ok(res, null, 'Retry queued'); },
  async rotateKey(req, res) {
    const r = await integrationService.rotateKey(pid(req), req.body, req.auth.user.id, req);
    res.setHeader('Cache-Control', 'no-store');
    ok(res, { ...r, endpoint: `${req.protocol}://${req.get('host')}/api/integrations/${r.website.toLowerCase()}/leads` }, 'New key generated. Copy it now; it will not be shown again.');
  },
  async syncNow(req, res) {
    const w = await query('SELECT code FROM websites WHERE id = ?', [pid(req)]);
    if (!w.length) throw notFound('Website not found');
    const { syncWebsite } = await import('../integrations/pull/syncService.js');
    const r = await syncWebsite(w[0].code);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'website', entityId: pid(req), req, meta: { action: 'pull_sync', created: r.created, updated: r.updated, failed: r.failed } });
    ok(res, r, `Imported ${r.created} new lead(s), refreshed ${r.updated}`);
  },
  async updateIntegration(req, res) { await integrationService.update(pid(req), req.body, req); ok(res, null, 'Integration updated'); },

  async analytics(req, res) { ok(res, await analyticsService.overview(req, req.validQuery)); },
  async audit(req, res) {
    const q = req.validQuery;
    const { total, rows } = await listAudit({ ...q, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },

  async getSettings(_req, res) { ok(res, await settingsService.all()); },
  async setSettings(req, res) {
    const entries = Object.entries(req.body.settings);
    for (const [k, v] of entries) {
      try { await settingsService.set(k, v, req.auth.user.id); } catch (e) { throw badRequest(e.message); }
    }
    await audit('SETTINGS_CHANGED', { actorId: req.auth.user.id, entityType: 'settings', req, meta: req.body.settings });
    ok(res, null, 'Settings saved');
  },

  async sessions(req, res) {
    const q = req.validQuery;
    const { total, rows } = await sessionRepo.listAllActive({ search: req.query.search || null, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async terminateSession(req, res) {
    const s = await sessionRepo.findById(pid(req));
    if (!s) throw notFound('Session not found');
    await userAdminService.assertCanTouchSessions(req, s.user_id);
    await sessionRepo.revoke(s.id, 'ADMIN_TERMINATED', req.auth.user.id);
    notificationService.forceLogout(s.id);
    await audit('SESSION_REVOKED', { actorId: req.auth.user.id, entityType: 'session', entityId: s.id, req, meta: { userId: s.user_id, byAdmin: true } });
    ok(res, null, 'Session terminated');
  },
  async terminateUserSessions(req, res) {
    const userId = pid(req);
    await userAdminService.assertCanTouchSessions(req, userId);
    const sessions = await sessionRepo.listActiveForUser(userId);
    await sessionRepo.revokeAllForUser(userId, 'ADMIN_TERMINATED_ALL', { by: req.auth.user.id });
    await query('UPDATE user_devices SET is_trusted = 0, trusted_until = NULL WHERE user_id = ?', [userId]);
    sessions.forEach((s) => notificationService.forceLogout(s.id));
    await audit('LOGOUT_ALL_DEVICES', { actorId: req.auth.user.id, entityType: 'user', entityId: userId, req, meta: { revoked: sessions.length, byAdmin: true } });
    ok(res, { revoked: sessions.length }, 'All sessions terminated');
  },

  async broadcast(req, res) {
    const { title, body, roleCode } = req.body;
    const users = roleCode
      ? await query("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = ? AND u.status = 'ACTIVE'", [roleCode])
      : await query("SELECT id FROM users WHERE status = 'ACTIVE'");
    await notificationService.notifyMany(users.map((u) => u.id), { type: 'SYSTEM', title, body });
    await audit('SYSTEM_NOTIFICATION_SENT', { actorId: req.auth.user.id, req, meta: { title, roleCode, recipients: users.length } });
    ok(res, { recipients: users.length }, 'Notification sent');
  },

  async systemHealth(_req, res) {
    let db = { ok: false };
    try { db = { ok: true, latencyMs: await pingDb() }; } catch (e) { db = { ok: false, error: 'unreachable' }; }
    const [counts] = await query(`SELECT (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM leads) leads,
      (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > NOW(3)) active_sessions,
      (SELECT COUNT(*) FROM integration_events WHERE status = 'FAILED') failed_events,
      (SELECT COUNT(*) FROM user_registration_requests WHERE status = 'PENDING_APPROVAL') pending_requests`);
    ok(res, {
      db, redis: { configured: Boolean(env.REDIS_URL), ok: redisAvailable() },
      otpProvider: isOtpProviderConfigured(), smtp: Boolean(env.SMTP_HOST), webPush: Boolean(env.VAPID_PUBLIC_KEY),
      counts, uptimeSeconds: Math.round(process.uptime()), node: process.version,
    });
  },

  async assignableAdmins(_req, res) { ok(res, await userRepo.usersWithPermission('lead.assign')); },
};
