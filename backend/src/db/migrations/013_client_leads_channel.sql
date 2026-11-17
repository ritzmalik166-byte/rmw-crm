-- "View Client Leads" permission: the Client Leads sidebar tab (leads sent by client landing pages through the Lead Capture API).
-- Owner, Super Admin and Admin get it; other roles only when granted.
INSERT INTO permissions (code, group_name, description)
VALUES ('lead.channel.client', 'lead', 'View Client Leads: leads from client landing pages (Lead Capture API), sidebar tab')
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), description = VALUES(description);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'lead.channel.client'
WHERE r.code IN ('OWNER', 'SUPER_ADMIN', 'ADMIN');
