import { query, one } from '../config/db.js';

const PUBLIC_COLS = 'u.id, u.full_name, u.email, u.mobile, u.avatar, u.status, u.department_id, u.last_login_at, u.created_at, u.updated_at';

export const userRepo = {
  findById: (id, conn) => one(`SELECT ${PUBLIC_COLS} FROM users u WHERE u.id = ?`, [id], conn),
  findAuthByEmail: (email) => one('SELECT * FROM users WHERE email = ?', [email]),
  findAuthByMobile: (mobile) => one('SELECT * FROM users WHERE mobile = ?', [mobile]),
  findAuthById: (id) => one('SELECT * FROM users WHERE id = ?', [id]),
  existsEmailOrMobile: (email, mobile) => one('SELECT id, email, mobile FROM users WHERE email = ? OR mobile = ? LIMIT 1', [email, mobile]),

  async create({ fullName, email, mobile, passwordHash, status = 'PENDING_APPROVAL', departmentId = null, avatar = null }, conn) {
    const res = await query(
      'INSERT INTO users (full_name, email, mobile, avatar, password_hash, status, department_id, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))',
      [fullName, email, mobile, avatar, passwordHash, status, departmentId], conn,
    );
    return res.insertId;
  },

  async update(id, fields, conn) {
    const map = { fullName: 'full_name', email: 'email', mobile: 'mobile', avatar: 'avatar', status: 'status', departmentId: 'department_id' };
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(map)) {
      if (fields[k] !== undefined) { sets.push(`${col} = ?`); params.push(fields[k]); }
    }
    if (!sets.length) return;
    params.push(id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params, conn);
  },

  setPassword: (id, hash, conn) => query('UPDATE users SET password_hash = ?, password_changed_at = NOW(3) WHERE id = ?', [hash, id], conn),
  touchLogin: (id) => query('UPDATE users SET last_login_at = NOW(3) WHERE id = ?', [id]),

  /** Roles, permissions and website access: the server-side authorization context. */
  async loadAuthContext(userId) {
    const roles = await query(
      'SELECT r.id, r.code, r.name, r.level FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [userId],
    );
    const perms = await query(
      `SELECT DISTINCT p.code FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id WHERE ur.user_id = ?`, [userId],
    );
    const isOwner = roles.some((r) => r.code === 'OWNER');
    const isSuperAdmin = isOwner || roles.some((r) => r.code === 'SUPER_ADMIN');
    const websites = isSuperAdmin
      ? await query('SELECT id, code, name FROM websites WHERE is_active = 1 ORDER BY id')
      : await query(
        `SELECT w.id, w.code, w.name FROM user_website_access uwa JOIN websites w ON w.id = uwa.website_id
         WHERE uwa.user_id = ? AND w.is_active = 1 ORDER BY w.id`, [userId],
      );
    const teams = await query(
      'SELECT t.id, t.name, t.department_id, tm.is_lead FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = ?', [userId],
    );
    return {
      roles: roles.map((r) => r.code),
      roleLevel: roles.reduce((m, r) => Math.max(m, r.level), 0),
      permissions: new Set(perms.map((p) => p.code)),
      isSuperAdmin,
      isOwner,
      websites,
      websiteIds: websites.map((w) => w.id),
      teams,
    };
  },

  async setRoles(userId, roleIds, conn) {
    await query('DELETE FROM user_roles WHERE user_id = ?', [userId], conn);
    if (roleIds.length) await query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [roleIds.map((r) => [userId, r])], conn);
  },

  async setWebsites(userId, websiteIds, conn) {
    await query('DELETE FROM user_website_access WHERE user_id = ?', [userId], conn);
    if (websiteIds.length) await query('INSERT INTO user_website_access (user_id, website_id) VALUES ?', [websiteIds.map((w) => [userId, w])], conn);
  },

  async setTeams(userId, teamIds, conn) {
    await query('DELETE FROM team_members WHERE user_id = ?', [userId], conn);
    if (teamIds.length) await query('INSERT INTO team_members (team_id, user_id) VALUES ?', [teamIds.map((t) => [t, userId])], conn);
  },

  async list({ search, status, roleCode, websiteId, limit, offset }) {
    const where = ['1=1']; const params = [];
    if (search) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)'); const s = `%${search}%`; params.push(s, s, s); }
    if (status) { where.push('u.status = ?'); params.push(status); }
    if (roleCode) { where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)'); params.push(roleCode); }
    if (websiteId) { where.push('EXISTS (SELECT 1 FROM user_website_access x WHERE x.user_id = u.id AND x.website_id = ?)'); params.push(websiteId); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) total FROM users u WHERE ${w}`, params);
    const rows = await query(
      `SELECT ${PUBLIC_COLS}, d.name AS department_name,
        (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
        (SELECT GROUP_CONCAT(ws.code) FROM user_website_access x JOIN websites ws ON ws.id = x.website_id WHERE x.user_id = u.id) AS websites,
        (SELECT GROUP_CONCAT(t.name SEPARATOR ', ') FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = u.id) AS teams
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE ${w} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },

  /** Active users holding a permission, optionally restricted to those with access to a website. */
  usersWithPermission(permission, websiteId = null) {
    return query(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE u.status = 'ACTIVE' AND p.code = ?
         AND (? IS NULL OR r.code IN ('OWNER', 'SUPER_ADMIN') OR EXISTS (SELECT 1 FROM user_website_access x WHERE x.user_id = u.id AND x.website_id = ?))`,
      [permission, websiteId, websiteId],
    );
  },
};
