/** Permission catalogue and default role grants. Seeded into the DB; the DB is the source of truth at runtime. */
export const PERMISSIONS = [
  ['area.crm', 'area', 'Access the CRM workspace'],
  ['area.admin', 'area', 'Access the Admin panel'],
  ['area.super_admin', 'area', 'Access the Super Admin panel'],

  ['lead.view', 'lead', 'View leads assigned to self'],
  ['lead.view_all', 'lead', 'View all leads for accessible websites'],
  ['lead.create', 'lead', 'Create leads manually'],
  ['lead.edit', 'lead', 'Edit lead details and status'],
  ['lead.delete', 'lead', 'Delete leads'],
  ['lead.assign', 'lead', 'Assign unassigned leads'],
  ['lead.reassign', 'lead', 'Reassign leads between users'],
  ['lead.export', 'lead', 'Export leads'],
  ['lead.merge', 'lead', 'Resolve duplicates and merge leads'],
  ['career.view', 'lead', 'View career applications and resumes'],

  ['user.view', 'user', 'View users'],
  ['user.create', 'user', 'Create users'],
  ['user.edit', 'user', 'Edit users'],
  ['user.disable', 'user', 'Disable or suspend users'],
  ['user.approve', 'user', 'Approve or reject registration requests'],
  ['user.block', 'user', 'Block or unblock any account (Owner only)'],

  ['role.view', 'role', 'View roles and permissions'],
  ['role.manage', 'role', 'Manage roles and their permissions'],

  ['team.manage', 'org', 'Manage teams and members'],
  ['department.manage', 'org', 'Manage departments'],
  ['website.manage', 'org', 'Manage websites'],

  ['analytics.view', 'analytics', 'View analytics'],
  ['analytics.export', 'analytics', 'Export analytics'],

  ['integration.view', 'integration', 'View integrations and health'],
  ['integration.manage', 'integration', 'Manage integrations and keys'],

  ['lead_config.manage', 'settings', 'Manage lead statuses and sources'],
  ['settings.view', 'settings', 'View system settings'],
  ['settings.manage', 'settings', 'Manage system settings'],
  ['notification.broadcast', 'settings', 'Send system notifications'],

  ['audit.view', 'security', 'View audit logs'],
  ['session.view_all', 'security', 'View sessions of all users'],
  ['session.revoke_any', 'security', 'Terminate any user session'],
];

const ALL = PERMISSIONS.map(([code]) => code);

/** Permissions that only the Owner holds. They can never be granted to another role. */
export const OWNER_ONLY_PERMISSIONS = ['user.block'];

export const ROLES = [
  {
    code: 'OWNER', name: 'Owner', level: 1000, description: 'System owner: full control, including blocking any account',
    permissions: ALL,
  },
  {
    code: 'SUPER_ADMIN', name: 'Super Admin', level: 100, description: 'Full system control',
    permissions: ALL.filter((c) => !OWNER_ONLY_PERMISSIONS.includes(c)),
  },
  {
    code: 'ADMIN', name: 'Admin', level: 50, description: 'Operational management',
    permissions: [
      'area.crm', 'area.admin',
      'lead.view', 'lead.view_all', 'lead.create', 'lead.edit', 'lead.assign', 'lead.reassign', 'lead.export', 'lead.merge',
      'user.view', 'user.edit', 'user.disable',
      'role.view', 'team.manage', 'department.manage',
      'analytics.view', 'analytics.export', 'integration.view',
      'lead_config.manage', 'settings.view', 'audit.view',
    ],
  },
  {
    code: 'NORMAL_USER', name: 'Normal User', level: 10, description: 'Marketing / sales employee',
    permissions: ['area.crm', 'lead.view', 'lead.edit'],
  },
];

export const WEBSITES = [
  { code: 'MPF', name: 'MyPropertyFact', domain: 'mypropertyfact.in', prefix: 'MPF' },
  { code: 'RMW', name: 'Ritz Media World', domain: 'ritzmediaworld.com', prefix: 'RMW' },
  { code: 'CT', name: 'Contenaissance', domain: 'contenaissance.com', prefix: 'CT' },
];

export const LEAD_STATUSES = [
  { code: 'NEW', name: 'New', color: 'blue', isDefault: 1 },
  { code: 'CONTACTED', name: 'Contacted', color: 'sky' },
  { code: 'INTERESTED', name: 'Interested', color: 'violet' },
  { code: 'FOLLOW_UP', name: 'Follow-up', color: 'amber' },
  { code: 'QUALIFIED', name: 'Qualified', color: 'indigo' },
  { code: 'CONVERTED', name: 'Converted', color: 'green', isConversion: 1, isClosed: 1 },
  { code: 'NOT_INTERESTED', name: 'Not interested', color: 'slate', isClosed: 1 },
  { code: 'LOST', name: 'Lost', color: 'red', isClosed: 1 },
];

export const DEFAULT_SETTINGS = {
  'auth.session_idle_minutes': 720,
  'auth.session_absolute_days': 7,
  'auth.trusted_device_days_options': [7, 30, 90],
  'auth.trusted_device_default_days': 30,
  'auth.password_reset_ttl_minutes': 30,
  'leads.auto_assign': 'NONE', // NONE | ROUND_ROBIN_TEAM
  'followups.reminder_minutes_before': 30,
};

export const NOTIFICATION_TYPES = ['NEW_LEAD', 'LEAD_ASSIGNED', 'LEAD_REASSIGNED', 'FOLLOWUP_DUE', 'FOLLOWUP_OVERDUE', 'SYSTEM', 'ACCOUNT_REQUEST'];
