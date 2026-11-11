import { pool, transaction } from '../config/db.js';
import { logger } from '../config/logger.js';
import { PERMISSIONS, ROLES, WEBSITES, LEAD_STATUSES, DEFAULT_SETTINGS } from '../config/rbac.js';

async function seed() {
  await transaction(async (conn) => {
    for (const [code, group, description] of PERMISSIONS) {
      await conn.query(
        'INSERT INTO permissions (code, group_name, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description)',
        [code, group, description],
      );
    }
    for (const role of ROLES) {
      await conn.query(
        'INSERT INTO roles (code, name, description, level, is_system) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE name = VALUES(name), level = VALUES(level)',
        [role.code, role.name, role.description, role.level],
      );
      const [[r]] = await conn.query('SELECT id FROM roles WHERE code = ?', [role.code]);
      await conn.query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id)
         SELECT ?, id FROM permissions WHERE code IN (?)`,
        [r.id, role.permissions],
      );
    }
    for (const w of WEBSITES) {
      await conn.query(
        'INSERT INTO websites (code, name, domain, external_id_prefix) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
        [w.code, w.name, w.domain, w.prefix],
      );
    }
    await conn.query('INSERT IGNORE INTO website_integrations (website_id) SELECT id FROM websites');
    let order = 10;
    for (const s of LEAD_STATUSES) {
      await conn.query(
        `INSERT INTO lead_statuses (code, name, color, sort_order, is_default, is_conversion, is_closed)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE code = code`,
        [s.code, s.name, s.color, order, s.isDefault || 0, s.isConversion || 0, s.isClosed || 0],
      );
      order += 10;
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await conn.query('INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    }
    const [[dept]] = await conn.query("SELECT id FROM departments WHERE name = 'Marketing'");
    let deptId = dept?.id;
    if (!deptId) {
      const [res] = await conn.query("INSERT INTO departments (name, description) VALUES ('Marketing', 'Marketing and sales')");
      deptId = res.insertId;
    }
    for (const w of WEBSITES) {
      await conn.query(
        'INSERT IGNORE INTO teams (department_id, website_id, name) SELECT ?, id, ? FROM websites WHERE code = ?',
        [deptId, `${w.code} Marketing`, w.code],
      );
    }
  });
  logger.info('Seed complete');
}

seed()
  .catch((err) => { logger.error({ err: err.message }, 'Seed failed'); process.exitCode = 1; })
  .finally(() => pool.end());
