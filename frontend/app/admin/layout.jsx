'use client';
import { LayoutDashboard, Users, UserPlus, UsersRound, Building2, Globe, Plug, BarChart3, ScrollText, Settings, Users2, Tags } from 'lucide-react';
import { AreaShell } from '@/components/layout/AppShell';
import { useAuth } from '@/providers/AuthProvider';

export default function AdminLayout({ children }) {
  const { can } = useAuth();
  const nav = [
    { items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/crm/leads', label: 'Leads', icon: Users2 },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, hidden: !can('analytics.view') },
    ] },
    { title: 'People', items: [
      { href: '/admin/users', label: 'Users', icon: Users, hidden: !can('user.view') },
      { href: '/admin/user-requests', label: 'User requests', icon: UserPlus, hidden: !can('user.view') },
      { href: '/admin/teams', label: 'Teams', icon: UsersRound },
      { href: '/admin/departments', label: 'Departments', icon: Building2 },
    ] },
    { title: 'Configuration', items: [
      { href: '/admin/websites', label: 'Websites', icon: Globe },
      { href: '/admin/lead-statuses', label: 'Lead statuses & sources', icon: Tags },
      { href: '/admin/integrations', label: 'Integrations', icon: Plug, hidden: !can('integration.view') },
      { href: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText, hidden: !can('audit.view') },
      { href: '/admin/settings', label: 'Settings', icon: Settings, hidden: !can('settings.view') },
    ] },
  ];
  return <AreaShell area="admin" nav={nav}>{children}</AreaShell>;
}
