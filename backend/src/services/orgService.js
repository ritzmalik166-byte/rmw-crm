import { query, one } from '../config/db.js';
import { audit } from './auditService.js';
import { notFound, conflict } from '../utils/errors.js';

export const orgService = {
  departments: () => query(
    `SELECT d.*, (SELECT COUNT(*) FROM teams t WHERE t.department_id = d.id) AS team_count,
       (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id) AS user_count FROM departments d ORDER BY d.name`,
  ),
  async createDepartment(req, { name, description }) {
    const r = await query('INSERT INTO departments (name, description) VALUES (?, ?)', [name, description || null]);
    await audit('DEPARTMENT_CREATED', { actorId: req.auth.user.id, entityType: 'department', entityId: r.insertId, req, meta: { name } });
    return { id: r.insertId };
  },
  async updateDepartment(req, id, { name, description, isActive }) {
    await query('UPDATE departments SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name ?? null, description ?? null, isActive === undefined ? null : isActive ? 1 : 0, id]);
    await audit('DEPARTMENT_UPDATED', { actorId: req.auth.user.id, entityType: 'department', entityId: id, req, meta: { name, isActive } });
  },
  async deleteDepartment(req, id) {
    const t = await one('SELECT COUNT(*) c FROM teams WHERE department_id = ?', [id]);
    if (t.c) throw conflict('Move or delete the teams in this department first', 'DEPARTMENT_IN_USE');
    await query('DELETE FROM departments WHERE id = ?', [id]);
    await audit('DEPARTMENT_DELETED', { actorId: req.auth.user.id, entityType: 'department', entityId: id, req });
  },

  teams: () => query(
    `SELECT t.*, d.name AS department_name, w.code AS website_code,
       (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
     FROM teams t JOIN departments d ON d.id = t.department_id LEFT JOIN websites w ON w.id = t.website_id ORDER BY d.name, t.name`,
  ),
  teamMembers: (teamId) => query(
    'SELECT u.id, u.full_name, u.email, u.status, tm.is_lead FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? ORDER BY u.full_name', [teamId],
  ),
  async createTeam(req, { name, departmentId, websiteId, description }) {
    const r = await query('INSERT INTO teams (name, department_id, website_id, description) VALUES (?, ?, ?, ?)', [name, departmentId, websiteId || null, description || null]);
    await audit('TEAM_CREATED', { actorId: req.auth.user.id, entityType: 'team', entityId: r.insertId, req, meta: { name } });
    return { id: r.insertId };
  },
  async updateTeam(req, id, { name, departmentId, websiteId, description, isActive }) {
    await query(
      `UPDATE teams SET name = COALESCE(?, name), department_id = COALESCE(?, department_id), website_id = ?, description = COALESCE(?, description),
       is_active = COALESCE(?, is_active) WHERE id = ?`,
      [name ?? null, departmentId ?? null, websiteId ?? null, description ?? null, isActive === undefined ? null : isActive ? 1 : 0, id],
    );
    await audit('TEAM_UPDATED', { actorId: req.auth.user.id, entityType: 'team', entityId: id, req });
  },
  async setTeamMembers(req, id, members) {
    const team = await one('SELECT id FROM teams WHERE id = ?', [id]);
    if (!team) throw notFound('Team not found');
    await query('DELETE FROM team_members WHERE team_id = ?', [id]);
    if (members.length) await query('INSERT INTO team_members (team_id, user_id, is_lead) VALUES ?', [members.map((m) => [id, m.userId, m.isLead ? 1 : 0])]);
    await audit('TEAM_MEMBERS_CHANGED', { actorId: req.auth.user.id, entityType: 'team', entityId: id, req, meta: { members: members.map((m) => m.userId) } });
  },
  async deleteTeam(req, id) {
    await query('DELETE FROM teams WHERE id = ?', [id]);
    await audit('TEAM_DELETED', { actorId: req.auth.user.id, entityType: 'team', entityId: id, req });
  },

  websites: () => query(
    `SELECT w.*, (SELECT COUNT(*) FROM leads l WHERE l.website_id = w.id) AS lead_count,
       (SELECT COUNT(*) FROM user_website_access x WHERE x.website_id = w.id) AS user_count FROM websites w ORDER BY w.id`,
  ),
  async updateWebsite(req, id, { name, domain, isActive }) {
    await query('UPDATE websites SET name = COALESCE(?, name), domain = COALESCE(?, domain), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name ?? null, domain ?? null, isActive === undefined ? null : isActive ? 1 : 0, id]);
    await audit('SETTINGS_CHANGED', { actorId: req.auth.user.id, entityType: 'website', entityId: id, req, meta: { name, domain, isActive } });
  },

  async createStatus(req, s) {
    const r = await query(
      'INSERT INTO lead_statuses (code, name, color, sort_order, is_conversion, is_closed) VALUES (?, ?, ?, ?, ?, ?)',
      [s.code, s.name, s.color || 'slate', s.sortOrder ?? 100, s.isConversion ? 1 : 0, s.isClosed ? 1 : 0],
    );
    await audit('SETTINGS_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_status', entityId: r.insertId, req, meta: { code: s.code } });
    return { id: r.insertId };
  },
  async updateStatus(req, id, s) {
    await query(
      `UPDATE lead_statuses SET name = COALESCE(?, name), color = COALESCE(?, color), sort_order = COALESCE(?, sort_order),
       is_conversion = COALESCE(?, is_conversion), is_closed = COALESCE(?, is_closed), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [s.name ?? null, s.color ?? null, s.sortOrder ?? null, s.isConversion === undefined ? null : s.isConversion ? 1 : 0,
        s.isClosed === undefined ? null : s.isClosed ? 1 : 0, s.isActive === undefined ? null : s.isActive ? 1 : 0, id],
    );
    if (s.isDefault) {
      await query('UPDATE lead_statuses SET is_default = (id = ?)', [id]);
    }
    await audit('SETTINGS_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_status', entityId: id, req, meta: s });
  },
};
