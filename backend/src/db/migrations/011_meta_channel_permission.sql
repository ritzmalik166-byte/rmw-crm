-- "View Meta leads" permission: controls the Meta section on the CRM dashboard, the Meta Leads sidebar item and the Meta
-- channel view. Owner, Super Admin and Admin get it; other roles (e.g. Normal User for new sign-ups) only when granted.
INSERT INTO permissions (code, group_name, description)
VALUES ('lead.channel.meta', 'lead', 'View Meta (Facebook + Instagram) leads: dashboard section, sidebar and Meta channel')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'lead.channel.meta'
WHERE r.code IN ('OWNER', 'SUPER_ADMIN', 'ADMIN');
