import { Router } from 'express';
import { adminController as c } from '../controllers/adminController.js';
import { authenticate, requireArea, requirePermission as can } from '../middleware/auth.js';
import { validate } from '../validators/common.js';
import { admin as s, pagination } from '../validators/schemas.js';
import { asyncHandler as h } from '../utils/http.js';

/** /api/admin: Admin and Super Admin. Each route also checks its own permission. */
export const adminRouter = Router();
const a = adminRouter;
a.use(authenticate, requireArea('admin'));

a.get('/user-requests', can('user.view'), validate(pagination, 'query'), h(c.listRequests));
a.get('/users', can('user.view'), validate(s.userQuery, 'query'), h(c.listUsers));
a.get('/users/:id', can('user.view'), h(c.getUser));
a.post('/users', can('user.create'), validate(s.userCreate), h(c.createUser));
a.patch('/users/:id', can('user.edit'), validate(s.userUpdate), h(c.updateUser));
a.post('/users/:id/status', can('user.disable'), validate(s.userStatus), h(c.setUserStatus));
a.get('/roles', can('role.view'), h(c.roles));

a.get('/departments', h(c.departments));
a.post('/departments', can('department.manage'), validate(s.department), h(c.createDepartment));
a.patch('/departments/:id', can('department.manage'), validate(s.departmentUpdate), h(c.updateDepartment));
a.delete('/departments/:id', can('department.manage'), h(c.deleteDepartment));
a.get('/teams', h(c.teams));
a.get('/teams/:id/members', h(c.teamMembers));
a.post('/teams', can('team.manage'), validate(s.team), h(c.createTeam));
a.patch('/teams/:id', can('team.manage'), validate(s.teamUpdate), h(c.updateTeam));
a.put('/teams/:id/members', can('team.manage'), validate(s.teamMembers), h(c.setTeamMembers));
a.delete('/teams/:id', can('team.manage'), h(c.deleteTeam));
a.get('/websites', h(c.websites));

a.post('/lead-statuses', can('lead_config.manage'), validate(s.status), h(c.createStatus));
a.patch('/lead-statuses/:id', can('lead_config.manage'), validate(s.statusUpdate), h(c.updateStatus));

a.get('/integrations', can('integration.view'), h(c.integrations));
a.get('/integrations/events', can('integration.view'), validate(pagination, 'query'), h(c.integrationEvents));
a.get('/analytics', can('analytics.view'), validate(s.analyticsQuery, 'query'), h(c.analytics));
a.get('/audit-logs', can('audit.view'), validate(s.auditQuery, 'query'), h(c.audit));
a.get('/settings', can('settings.view'), h(c.getSettings));

/** /api/super-admin: Super Admin only (area.super_admin), plus per-route permissions. */
export const superAdminRouter = Router();
const sa = superAdminRouter;
sa.use(authenticate, requireArea('super_admin'));

sa.post('/user-requests/:id/approve', can('user.approve'), validate(s.approve), h(c.approve));
sa.post('/user-requests/:id/reject', can('user.approve'), validate(s.reject), h(c.reject));
sa.get('/permissions', can('role.view'), h(c.permissions));
sa.post('/roles', can('role.manage'), validate(s.role), h(c.createRole));
sa.put('/roles/:id/permissions', can('role.manage'), validate(s.rolePermissions), h(c.setRolePermissions));
sa.patch('/websites/:id', can('website.manage'), validate(s.website), h(c.updateWebsite));
sa.patch('/integrations/:id', can('integration.manage'), validate(s.integration), h(c.updateIntegration));
sa.post('/integrations/:id/rotate-key', can('integration.manage'), validate(s.rotateKey), h(c.rotateKey));
sa.post('/integrations/:id/sync', can('integration.manage'), h(c.syncNow));
sa.post('/integrations/events/:id/retry', can('integration.manage'), h(c.retryEvent));
sa.put('/settings', can('settings.manage'), validate(s.settings), h(c.setSettings));
sa.get('/sessions', can('session.view_all'), validate(pagination, 'query'), h(c.sessions));
sa.delete('/sessions/:id', can('session.revoke_any'), h(c.terminateSession));
sa.post('/users/:id/terminate-sessions', can('session.revoke_any'), h(c.terminateUserSessions));
sa.post('/notifications/broadcast', can('notification.broadcast'), validate(s.broadcast), h(c.broadcast));
sa.get('/system-health', can('settings.view'), h(c.systemHealth));
