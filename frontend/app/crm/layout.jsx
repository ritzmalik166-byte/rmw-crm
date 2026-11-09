'use client';
import { LayoutDashboard, Users2, CalendarClock, Bell, Settings, ShieldCheck } from 'lucide-react';
import { AreaShell } from '@/components/layout/AppShell';

const NAV = [
  { items: [
    { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/crm/leads', label: 'Leads', icon: Users2 },
    { href: '/crm/followups', label: 'Follow-ups', icon: CalendarClock },
    { href: '/crm/notifications', label: 'Notifications', icon: Bell },
  ] },
  { title: 'Account', items: [
    { href: '/crm/settings', label: 'Settings', icon: Settings },
    { href: '/crm/settings/security', label: 'Security & devices', icon: ShieldCheck },
  ] },
];

export default function CrmLayout({ children }) {
  return <AreaShell area="crm" nav={NAV}>{children}</AreaShell>;
}
