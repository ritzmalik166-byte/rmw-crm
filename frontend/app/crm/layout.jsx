'use client';
import { LayoutDashboard, Users2, CalendarClock, Bell, Settings, ShieldCheck, Briefcase, Handshake, Plug } from 'lucide-react';
import { AreaShell } from '@/components/layout/AppShell';
import { MetaMark } from '@/components/integrations/MetaLogo';

const NAV = [
  { items: [
    { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Lead pipelines', items: [
    { href: '/crm/leads', label: 'All Leads', icon: Users2, exact: true },
    { href: '/crm/pipeline/mpf', website: 'MPF', label: 'MPF Leads', logo: '/mpf-mark.png', badgeKey: 'mpf' },
    { href: '/crm/pipeline/rmw', website: 'RMW', label: 'RMW Leads', logo: '/rmw-mark.png', badgeKey: 'rmw' },
    { href: '/crm/pipeline/ct', website: 'CT', label: 'CT Leads', logo: '/ct-mark.png', badgeKey: 'ct' },
    { href: '/crm/pipeline/ctmpl', website: 'CTMPL', label: 'CTMPL Leads', logo: '/ctmpl-mark.png', badgeKey: 'ctmpl' },
  ] },
  // One item per lead connector; its badgeKey must match lib/newLeadBadges CONNECTOR_KEYS.
  { title: 'Lead channels', items: [
    { href: '/crm/meta', label: 'Meta Leads', icon: MetaMark, brandIcon: true, perm: 'lead.channel.meta', badgeKey: 'meta' },
    { href: '/crm/client-leads', label: 'Client Leads', icon: Handshake, perm: 'lead.channel.client', badgeKey: 'client' },
  ] },
  { title: 'Recruitment', items: [
    { href: '/crm/pipeline/career', label: 'Career Applications', icon: Briefcase, badgeKey: 'career', perm: 'career.view' },
  ] },
  { title: 'Work', items: [
    { href: '/crm/followups', label: 'Follow-ups', icon: CalendarClock },
    { href: '/crm/notifications', label: 'Notifications', icon: Bell, countKey: 'notifications' },
  ] },
  { title: 'Account', items: [
    { href: '/crm/integrations', label: 'Integrations', icon: Plug, perm: 'integration.manage' },
    { href: '/crm/settings', label: 'Settings', icon: Settings, exact: true },
    { href: '/crm/settings/security', label: 'Security & devices', icon: ShieldCheck },
  ] },
];

export default function CrmLayout({ children }) {
  return <AreaShell area="crm" nav={NAV}>{children}</AreaShell>;
}
