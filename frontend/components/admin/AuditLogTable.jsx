'use client';
import { useUiVersion } from '@/lib/useUiVersion';
import { AuditLogTable as LegacyAuditLogTable } from '@/components/legacy/AuditLogTable';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  LogIn, LogOut, ShieldAlert, KeyRound, Smartphone, UserPlus, UserCog, UserCheck, UserX, Users2, Tag, ArrowRightLeft, FilePlus2,
  Trash2, Download, GitMerge, Settings2, Plug, Megaphone, Building2, ChevronDown, Activity, Globe, Pencil, Copy,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { cn, formatDateTime, timeAgo, toQuery } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { FILTER_MIN_DATE, filterMaxDate } from '@/components/ui/date-range';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/feedback';

const CATEGORIES = [
  { key: 'human', label: 'People activity' },
  { key: 'leads', label: 'Leads' },
  { key: 'people', label: 'Users & access' },
  { key: 'security', label: 'Sign-ins & security' },
  { key: 'config', label: 'Configuration' },
  { key: '', label: 'Everything' },
];

const pretty = (code) => String(code || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const FIELD_LABELS = { fullName: 'name', name: 'name', phone: 'phone', email: 'email', interest: 'interest', location: 'location', message: 'notes', statusId: 'status', roleId: 'role', websiteIds: 'websites', teamIds: 'teams', departmentId: 'department', isActive: 'active flag', avatar: 'profile photo', mobile: 'mobile number' };
const fields = (list) => (Array.isArray(list) && list.length ? list.map((f) => FIELD_LABELS[f] || pretty(f).toLowerCase()).join(', ') : null);

const TONES = {
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  red: 'bg-red-50 text-red-600 ring-red-200',
  blue: 'bg-blue-50 text-blue-600 ring-blue-200',
  violet: 'bg-violet-50 text-violet-600 ring-violet-200',
  amber: 'bg-amber-50 text-amber-600 ring-amber-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const B = ({ children }) => <b className="font-semibold text-slate-900">{children}</b>;

/** Turns one audit row into an icon, a tone and a plain-English sentence ("Priya moved lead X from New to Contacted"). */
function describe(r) {
  const m = r.meta || {};
  const refs = r.user_refs || {};
  const lead = r.entity_type === 'lead' && r.entity_id
    ? <Link href={`/crm/leads/${r.entity_id}`} className="font-semibold text-[hsl(var(--primary))] hover:underline">{r.lead_name || r.lead_ref || m.externalLeadId || `lead #${r.entity_id}`}</Link>
    : null;
  const target = r.target_user_name ? <B>{r.target_user_name}</B> : r.entity_type === 'user' ? <B>user #{r.entity_id}</B> : null;
  const self = r.entity_type === 'user' && String(r.entity_id) === String(r.actor_user_id);
  const via = m.authMethod || m.method;

  switch (r.action) {
    case 'LOGIN_SUCCESS': return { icon: LogIn, tone: 'green', text: <>signed in{via ? <> with <B>{pretty(via).toLowerCase()}</B></> : ''}</> };
    case 'LOGIN_FAILED': return { icon: ShieldAlert, tone: 'red', text: <>failed to sign in{m.reason ? <> ({pretty(m.reason).toLowerCase()})</> : ''}</> };
    case 'LOGOUT': return { icon: LogOut, tone: 'slate', text: <>signed out</> };
    case 'LOGOUT_ALL_DEVICES': return { icon: LogOut, tone: 'amber', text: <>signed {m.byAdmin ? <>{target} out of</> : 'out of'} all devices{m.revoked != null ? <> ({m.revoked} session{m.revoked === 1 ? '' : 's'})</> : ''}</> };
    case 'SESSION_REVOKED': return { icon: LogOut, tone: 'amber', text: m.reason === 'IDLE_TIMEOUT' ? <>was signed out after being idle</> : <>ended a session{refs.userId ? <> of <B>{refs.userId}</B></> : ''}</> };
    case 'PASSWORD_CHANGED': return { icon: KeyRound, tone: 'violet', text: <>changed their password</> };
    case 'PASSWORD_RESET': return { icon: KeyRound, tone: 'violet', text: m.byAdmin ? <>reset the password of {target}</> : m.stage === 'requested' ? <>requested a password reset</> : <>reset their password</> };
    case 'NEW_DEVICE_DETECTED': return { icon: Smartphone, tone: 'amber', text: <>signed in from a new device{m.browser || m.os ? <> (<B>{[m.browser, m.os].filter(Boolean).join(' on ')}</B>)</> : ''}</> };
    case 'DEVICE_TRUSTED': return { icon: Smartphone, tone: 'blue', text: <>trusted this device{m.days ? <> for <B>{m.days} days</B></> : ''}</> };
    case 'DEVICE_REVOKED': return { icon: Smartphone, tone: 'amber', text: <>removed a trusted device</> };

    case 'ACCOUNT_REQUESTED': return { icon: UserPlus, tone: 'blue', text: <>requested an account</> };
    case 'ACCOUNT_APPROVED': return { icon: UserCheck, tone: 'green', text: <>approved {target}{m.role ? <> as <B>{pretty(m.role)}</B></> : ''}</> };
    case 'ACCOUNT_REJECTED': return { icon: UserX, tone: 'red', text: <>rejected the account request of {target}{m.reason ? <> — “{m.reason}”</> : ''}</> };
    case 'ACCOUNT_DISABLED': case 'ACCOUNT_BLOCKED': return { icon: UserX, tone: 'red', text: <>{r.action === 'ACCOUNT_BLOCKED' ? 'blocked' : 'disabled'} {target}</> };
    case 'ACCOUNT_ENABLED': case 'ACCOUNT_UNBLOCKED': return { icon: UserCheck, tone: 'green', text: <>{r.action === 'ACCOUNT_UNBLOCKED' ? 'unblocked' : 'enabled'} {target}</> };
    case 'USER_CREATED': return { icon: UserPlus, tone: 'green', text: <>created the user {target}</> };
    case 'USER_UPDATED': return { icon: UserCog, tone: 'blue', text: self || m.self ? <>updated their own {fields(m.fields) || 'profile'}</> : <>updated {target}{fields(m.fields) ? <> — {fields(m.fields)}</> : ''}</> };
    case 'ROLE_CHANGED': return { icon: UserCog, tone: 'violet', text: <>changed the role of {target}</> };
    case 'ROLE_CREATED': return { icon: UserCog, tone: 'violet', text: <>created the role <B>{m.code}</B></> };
    case 'PERMISSION_CHANGED': return { icon: KeyRound, tone: 'violet', text: <>changed role permissions</> };
    case 'TEAM_CREATED': case 'TEAM_UPDATED': case 'TEAM_DELETED': case 'TEAM_MEMBERS_CHANGED':
      return { icon: Users2, tone: r.action === 'TEAM_DELETED' ? 'red' : 'blue', text: <>{{ TEAM_CREATED: 'created the team', TEAM_UPDATED: 'updated a team', TEAM_DELETED: 'deleted a team', TEAM_MEMBERS_CHANGED: 'changed team members' }[r.action]}{m.name ? <> <B>{m.name}</B></> : ''}{Array.isArray(m.members) ? <> ({m.members.length} members)</> : ''}</> };
    case 'DEPARTMENT_CREATED': case 'DEPARTMENT_UPDATED': case 'DEPARTMENT_DELETED':
      return { icon: Building2, tone: r.action === 'DEPARTMENT_DELETED' ? 'red' : 'blue', text: <>{pretty(r.action.split('_')[1]).toLowerCase()} a department{m.name ? <> <B>{m.name}</B></> : ''}</> };

    case 'LEAD_CREATED': return { icon: FilePlus2, tone: 'green', text: m.manual ? <>added the lead {lead}</> : <>received the lead {lead}{m.website ? <> on <B>{m.website}</B></> : ''}{m.sourceType ? <> via {pretty(m.sourceType).toLowerCase()}</> : ''}</> };
    case 'LEAD_ASSIGNED': return { icon: UserPlus, tone: 'blue', text: <>{m.auto ? 'auto-assigned' : 'assigned'} {lead}{refs.to ? <> to <B>{refs.to}</B></> : ''}</> };
    case 'LEAD_REASSIGNED': return { icon: ArrowRightLeft, tone: 'blue', text: <>transferred {lead}{refs.from ? <> from <B>{refs.from}</B></> : ''}{refs.to ? <> to <B>{refs.to}</B></> : ''}</> };
    case 'LEAD_STATUS_CHANGED': return { icon: Tag, tone: m.conversion ? 'green' : 'violet', text: <>moved {lead}{m.from ? <> from <B>{pretty(m.from)}</B></> : ''}{m.to ? <> to <B>{pretty(m.to)}</B></> : ''}{m.conversion ? ' 🎉' : ''}</> };
    case 'LEAD_UPDATED': return { icon: Pencil, tone: 'blue', text: <>edited {lead}{fields(m.fields) ? <> — {fields(m.fields)}</> : ''}</> };
    case 'LEAD_MERGED': return { icon: GitMerge, tone: 'violet', text: <>merged {m.mergedExternalId ? <B>{m.mergedExternalId}</B> : 'a duplicate'} into {lead}</> };
    case 'LEAD_DUPLICATE_KEPT': return { icon: Copy, tone: 'slate', text: <>marked {lead} as not a duplicate</> };
    case 'LEAD_DELETED': return { icon: Trash2, tone: 'red', text: <>deleted the lead <B>{m.externalLeadId || `#${r.entity_id}`}</B></> };
    case 'LEAD_EXPORTED': return { icon: Download, tone: 'amber', text: <>exported <B>{m.count ?? 'some'} leads</B> to CSV</> };

    case 'SETTINGS_CHANGED': return { icon: Settings2, tone: 'slate', text: r.entity_type === 'lead_status' ? <>changed the lead status <B>{m.code || m.name || `#${r.entity_id}`}</B></> : r.entity_type === 'website' ? <>updated the website <B>{m.name || `#${r.entity_id}`}</B></> : <>changed system settings{m && Object.keys(m).length ? <> — {Object.keys(m).join(', ')}</> : ''}</> };
    case 'INTEGRATION_CHANGED': return { icon: r.entity_type?.startsWith('meta') ? Globe : Plug, tone: 'slate', text: <>{pretty(String(m.action || 'updated').replace(/^meta_/, '')).toLowerCase()} · {pretty(r.entity_type || 'integration').toLowerCase()}{m.name || m.client ? <> <B>{m.name || m.client}</B></> : ''}{m.created != null ? <> ({m.created} new, {m.updated ?? 0} updated)</> : ''}</> };
    case 'SYSTEM_NOTIFICATION_SENT': return { icon: Megaphone, tone: 'blue', text: <>sent the announcement <B>“{m.title}”</B> to {m.recipients ?? ''} people</> };
    default: return { icon: Activity, tone: 'slate', text: <>{pretty(r.action).toLowerCase()}{r.entity_type ? <> · {r.entity_type} #{r.entity_id}</> : ''}</> };
  }
}

const initials = (n) => String(n || 'S').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const dayLabel = (d) => {
  const day = new Date(d); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (day.toDateString() === today.toDateString()) return 'Today';
  if (day.toDateString() === y.toDateString()) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

function Entry({ r }) {
  const [open, setOpen] = useState(false);
  const d = describe(r);
  const Icon = d.icon;
  const hasMeta = r.meta && Object.keys(r.meta).length > 0;
  return (
    <li className="group relative flex gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:px-5">
      <span className="relative shrink-0">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-[11.5px] font-semibold ring-2 ring-white', r.actor_name ? 'bg-gradient-to-br from-[hsl(213_70%_93%)] to-[hsl(213_60%_85%)] text-[hsl(var(--primary))]' : 'bg-slate-100 text-slate-500')}>
          {r.actor_name ? initials(r.actor_name) : <Activity className="h-4 w-4" />}
        </span>
        <span className={cn('absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full ring-2 ring-white', TONES[d.tone])}><Icon className="h-2.5 w-2.5" strokeWidth={2.5} /></span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-slate-600">
          <B>{r.actor_name || 'System'}</B> {d.text}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-400">
          <span title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)} · {new Date(r.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
          {r.ip_address && <span className="font-mono">{r.ip_address}</span>}
          {(hasMeta || r.user_agent) && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-0.5 font-medium text-slate-500 hover:text-slate-800">
              Details<ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>
          )}
        </p>
        {open && (
          <div className="mt-2 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11.5px]">
            <p className="text-slate-500"><span className="font-semibold text-slate-700">Event:</span> {r.action}{r.entity_type ? ` · ${r.entity_type} #${r.entity_id}` : ''}{r.actor_email ? ` · ${r.actor_email}` : ''}</p>
            {r.user_agent && <p className="truncate text-slate-500" title={r.user_agent}><span className="font-semibold text-slate-700">Device:</span> {r.user_agent}</p>}
            {hasMeta && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-600">{JSON.stringify(r.meta, null, 2)}</pre>}
          </div>
        )}
      </div>
      <span className="hidden shrink-0 text-[11.5px] tabular-nums text-slate-400 sm:block">{new Date(r.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
    </li>
  );
}

function AuditLogTableV2() {
  const { me } = useAuth();
  const allowed = me?.areas?.superAdmin;
  const [f, setF] = useState({ category: 'human', from: '', to: '', page: 1 });
  const q = { ...f, limit: 50 };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'audit', q], queryFn: () => api(`/admin/audit-logs${toQuery(q)}`), placeholderData: keepPreviousData, enabled: Boolean(allowed),
  });
  const groups = useMemo(() => {
    const out = [];
    for (const r of data?.rows || []) {
      const label = dayLabel(r.created_at);
      if (out.at(-1)?.label !== label) out.push({ label, rows: [] });
      out.at(-1).rows.push(r);
    }
    return out;
  }, [data]);

  if (me && !allowed) {
    return (
      <>
        <PageHeader title="Activity log" />
        <Card><EmptyState title="Owner and Super Admin only" description="The activity log is visible to the Owner and Super Admins." /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Activity log" description="Who did what, and when, across the CRM. Passwords and OTPs are never recorded." />
      <Card className="mb-4 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0.5 [scrollbar-width:none]">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" onClick={() => setF({ ...f, category: c.key, page: 1 })}
                className={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors', f.category === c.key ? 'bg-white text-[hsl(var(--primary))] shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>{c.label}</button>
            ))}
          </div>
          <div className="ml-auto grid w-full grid-cols-2 gap-2 sm:w-auto">
            <Input type="date" min={FILTER_MIN_DATE} max={filterMaxDate()} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} aria-label="From" title="From" />
            <Input type="date" min={FILTER_MIN_DATE} max={filterMaxDate()} value={(f.to || '').slice(0, 10)} onChange={(e) => setF({ ...f, to: e.target.value ? `${e.target.value}T23:59:59` : '', page: 1 })} aria-label="To" title="To" />
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden">
        {isLoading || !me ? (
          <div className="space-y-4 p-5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/4" /></div></div>)}</div>
        ) : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No activity" description="Nothing matches this filter yet." /> : (
          <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="sticky top-0 z-[1] border-y border-slate-100 bg-slate-50/95 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 backdrop-blur first:border-t-0">{g.label}</h3>
                <ul className="divide-y divide-slate-100">{g.rows.map((r) => <Entry key={r.id} r={r} />)}</ul>
              </section>
            ))}
          </div>
        )}
        <Pagination meta={data?.meta} onPage={(page) => setF({ ...f, page })} />
      </Card>
    </>
  );
}

export function AuditLogTable() { const v = useUiVersion(); if (v === null) return null; return v === 2 ? <AuditLogTableV2 /> : <LegacyAuditLogTable />; }
