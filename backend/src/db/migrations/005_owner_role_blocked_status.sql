-- Owner role (above Super Admin) and the BLOCKED account status, which only the Owner can set or clear.
ALTER TABLE users
  MODIFY status ENUM('PENDING_APPROVAL','ACTIVE','DISABLED','SUSPENDED','REJECTED','BLOCKED') NOT NULL DEFAULT 'PENDING_APPROVAL';

INSERT INTO permissions (code, group_name, description)
VALUES ('user.block', 'user', 'Block or unblock any account (Owner only)')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description);

INSERT INTO roles (code, name, description, level, is_system)
VALUES ('OWNER', 'Owner', 'System owner: full control, including blocking any account', 1000, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), level = VALUES(level);

-- The Owner holds every permission.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'OWNER';

-- user.block is Owner-only, even if an earlier seed handed it to another role.
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'user.block' AND r.code <> 'OWNER';
