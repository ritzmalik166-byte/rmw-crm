'use client';
import { LayoutDashboard, Users2, CalendarClock, Bell, Settings, ShieldCheck, Briefcase } from 'lucide-react';
import { AreaShell } from '@/components/layout/AppShell';

const NAV = [
  { items: [
    { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Lead pipelines', items: [
    { href: '/crm/leads', label: 'All leads', icon: Users2, exact: true },
    { href: '/crm/pipeline/mpf', label: 'MPF Leads', logo: '/mpf-mark.png', countKey: 'mpf' },
    { href: '/crm/pipeline/rmw', label: 'RMW Leads', logo: '/rmw-mark.png', countKey: 'rmw' },
    { href: '/crm/pipeline/ct', label: 'CT Leads', logo: '/ct-mark.png', countKey: 'ct' },
  ] },
  { title: 'Recruitment', items: [
    { href: '/crm/pipeline/career', label: 'Career applications', icon: Briefcase, countKey: 'career', perm: 'career.view' },
  ] },
  { title: 'Work', items: [
    { href: '/crm/followups', label: 'Follow-ups', icon: CalendarClock },
    { href: '/crm/notifications', label: 'Notifications', icon: Bell },
  ] },
  { title: 'Account', items: [
    { href: '/crm/settings', label: 'Settings', icon: Settings, exact: true },
    { href: '/crm/settings/security', label: 'Security & devices', icon: ShieldCheck },
  ] },
];

export default function CrmLayout({ children }) {
  return <AreaShell area="crm" nav={NAV}>{children}</AreaShell>;
}
