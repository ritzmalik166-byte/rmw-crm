/**
 * Release notes shown in the "What's new" panel (sidebar footer → click the version).
 *
 * To ship an update: bump "version" in frontend/package.json, then add an entry at the TOP of this list with the
 * same version. Users who have not opened the panel since see a "New" tag on the footer card until they do.
 * Write items as plain benefits for the people using the CRM, not as technical notes.
 */
export const CHANGELOG = [
  {
    version: '2.0.0',
    date: '2026-11-20',
    title: 'A new look and a smarter dashboard',
    items: [
      'Fresh design: navy sidebar, cleaner cards and tables, and smooth, calm transitions everywhere.',
      "“Today's priorities” at the top of the dashboard: overdue follow-ups, follow-ups due today, leads waiting for an owner and your new leads, each one click away.",
      'The dashboard now adapts to your role: managers see the team picture first, everyone else starts with their own work.',
      'Meta lead cards show the change versus the previous period and a 7-day trend line.',
      'Search leads from anywhere with the search bar or Ctrl+K / ⌘K.',
      'Switch between CRM, Admin and Super Admin from the Workspace menu in the sidebar.',
      'Layouts adapt properly to laptops, tablets and phones.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-09',
    title: 'RMW CRM launch',
    items: [
      'One place for leads from MPF, RMW, CT and CTMPL websites, Meta lead ads and client landing pages.',
      'Automatic round-robin assignment, follow-ups with overdue alerts, notes and duplicate detection.',
      'Roles and permissions, teams and departments, audit logs and trusted-device sign-in.',
      'Live notifications in the browser, by email and on the mobile app.',
    ],
  },
];

export const SEEN_VERSION_KEY = 'crm:seenVersion';
