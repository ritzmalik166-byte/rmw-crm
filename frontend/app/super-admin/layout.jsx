'use client';
import {
  LayoutDashboard, UserPlus, Users, ShieldCheck, KeyRound, Building2, UsersRound, Globe, Plug, Tags, Settings, MonitorSmartphone, ScrollText, Activity, BarChart3, Megaphone, Radio, Bot, Headphones,
} from 'lucide-react';
import { AreaShell } from '@/components/layout/AppShell';

const NAV = [
  { items: [
    { href: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/super-admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/super-admin/system', label: 'System health', icon: Activity },
    // user.block is held only by the Owner, so only the Owner sees this item (the API checks Owner too).
    { href: '/super-admin/live-users', label: 'Live users', icon: Radio, perm: 'user.block' },
  ] },
  { title: 'Access', items: [
    { href: '/super-admin/user-requests', label: 'User requests', icon: UserPlus },
    { href: '/super-admin/users', label: 'Users & admins', icon: Users },
    { href: '/super-admin/roles', label: 'Roles', icon: ShieldCheck },
    { href: '/super-admin/permissions', label: 'Permissions', icon: KeyRound },
    { href: '/super-admin/security', label: 'Sessions & security', icon: MonitorSmartphone },
  ] },
  { title: 'Organisation', items: [
    { href: '/super-admin/departments', label: 'Departments', icon: Building2 },
    { href: '/super-admin/teams', label: 'Teams', icon: UsersRound },
    { href: '/super-admin/websites', label: 'Websites', icon: Globe },
  ] },
  { title: 'Configuration', items: [
    { href: '/super-admin/integrations', label: 'Integrations', icon: Plug },
    { href: '/super-admin/lead-config', label: 'Lead configuration', icon: Tags },
    { href: '/super-admin/ai-calling', label: 'AI calling', icon: Bot, perm: 'aicall.manage' },
    { href: '/super-admin/call-recordings', label: 'Call recordings', icon: Headphones, perm: 'aicall.view' },
    { href: '/super-admin/notifications', label: 'Notifications', icon: Megaphone },
    { href: '/super-admin/settings', label: 'System settings', icon: Settings },
    { href: '/super-admin/audit-logs', label: 'Activity log', icon: ScrollText },
  ] },
];

export default function SuperAdminLayout({ children }) {
  return <AreaShell area="superAdmin" nav={NAV}>{children}</AreaShell>;
}
