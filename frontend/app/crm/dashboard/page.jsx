'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, Users, Sparkles, CalendarCheck, AlertTriangle, Clock, TrendingUp, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { PIPELINES, PIPELINE_ORDER, PipelineLogo } from '@/lib/pipelines';
import { cn, timeAgo, titleCase, formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { DateRangeFilter, rangeLabel, todayRange } from '@/components/ui/date-range';
import { toQuery } from '@/lib/utils';
import { MetaLeadFormsList } from '@/components/marketing/MetaLeadForms';
import { MetaMark } from '@/components/integrations/MetaLogo';
import { LeadSourceChip, leadChannel, CHANNEL_STYLE } from '@/components/leads/LeadSource';
import { IntegrationMarketplace } from '@/components/integrations/IntegrationMarketplace';
import { Plus } from 'lucide-react';


const AVATAR_TONE = { meta: 'from-blue-500 to-indigo-600', client: 'from-violet-500 to-fuchsia-600', website: 'from-teal-500 to-emerald-600' };
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

/** One lead in a dashboard list: channel colour bar, initials, name + time, classified source chip, project, status and owner. */
function DashLeadRow({ l, showOwner = true }) {
  const ch = leadChannel(l);
  return (
    <li>
      <Link href={`/crm/leads/${l.id}`} className="group relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[hsl(var(--accent)/0.6)]">
        <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-70 group-hover:opacity-100', CHANNEL_STYLE[ch].bar)} />
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white shadow-sm ring-2 ring-white', AVATAR_TONE[ch])}>{initials(l.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13.5px] font-semibold text-slate-900 group-hover:text-[hsl(var(--primary))]">{l.name || 'Unnamed lead'}</p>
            <span className="shrink-0 text-[11px] tabular-nums text-slate-400" title={formatDate(l.external_created_at || l.created_at)}>{timeAgo(l.external_created_at || l.created_at)}</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <LeadSourceChip lead={l} className="shrink-0" />
            {l.interest && <span className="min-w-0 truncate text-[12px] text-slate-500" title={l.interest}>{l.interest}</span>}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <StatusBadge name={l.status_name} color={l.status_color} />
          {showOwner && <span className={cn('text-[11px]', l.assigned_user_name ? 'text-slate-500' : 'font-medium text-amber-600')}>{l.assigned_user_name || 'Unassigned'}</span>}
        </div>
      </Link>
    </li>
  );
}

function Panel({ title, action, children, className }) {
  return (
    <section className={cn('panel overflow-hidden', className)}>
      <div className="panel-head"><h2 className="panel-title">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

/** One palette for every metric: same meaning → same colour everywhere on the page. */
const TONES = {
  neutral: { bar: 'bg-[hsl(var(--primary))]', chip: 'bg-[hsl(213_60%_94%)] text-[hsl(var(--primary))]', num: 'text-slate-900' },
  info: { bar: 'bg-blue-500', chip: 'bg-blue-50 text-blue-600', num: 'text-blue-700' },
  warn: { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', num: 'text-amber-700' },
  danger: { bar: 'bg-red-500', chip: 'bg-red-50 text-red-600', num: 'text-red-700' },
  success: { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', num: 'text-emerald-700' },
};

function Strip({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, value, toneKey, href, Icon]) => {
        const t = TONES[(value ? toneKey : null) || 'neutral'];
        const inner = (
          <>
            <span className={cn('absolute inset-x-0 top-0 h-[3px]', t.bar)} />
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              {Icon && <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', t.chip)}><Icon className="h-3.5 w-3.5" /></span>}
            </div>
            <p className={cn('mt-0.5 text-[22px] font-semibold leading-tight tabular-nums', t.num)}>{value ?? 0}</p>
          </>
        );
        const cls = 'relative overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3.5 pb-3 pt-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]';
        return href
          ? <Link key={label} href={href} className={cn(cls, 'transition hover:-translate-y-px hover:shadow-md')}>{inner}</Link>
          : <div key={label} className={cls}>{inner}</div>;
      })}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Home-page integrations strip for users granted "Manage integrations": Meta status + Add integration. */
function HomeIntegrations() {
  const [market, setMarket] = useState(false);
  const { data: s } = useQuery({ queryKey: ['meta', 'status'], queryFn: () => api('/manage/integrations/meta/status'), staleTime: 60_000 });
  const pages = s?.connection?.pages || [];
  const connected = s && !['NOT_CONNECTED', 'NOT_CONFIGURED'].includes(s.state);
  return (
    <Panel title="Integrations" action={<Link href="/crm/integrations" className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">Manage</Link>}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Link href="/crm/integrations" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border p-2.5 hover:bg-slate-50">
          <MetaMark className="h-6 w-6 shrink-0" />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-slate-900">Meta {connected ? <span className="font-normal text-emerald-700">· Connected</span> : <span className="font-normal text-slate-500">· Not connected</span>}</span>
            <span className="block truncate text-[12px] text-slate-500">{pages.length ? pages.map((p) => p.name).join(', ') : connected ? 'No Page switched on yet' : 'Connect once to bring in all your Pages'}</span>
          </span>
        </Link>
        <button type="button" onClick={() => setMarket(true)}
          className="flex items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-medium text-slate-600 hover:border-blue-400 hover:text-blue-700">
          <Plus className="h-4 w-4" />Add integration
        </button>
      </div>
      {market && <IntegrationMarketplace open onOpenChange={setMarket} onManageMeta={() => { window.location.href = '/crm/integrations?open=pages'; }} />}
    </Panel>
  );
}

export default function CrmDashboard() {
  const { me, can } = useAuth();
  const [range, setRange] = useState(todayRange);
  const rq = { from: range.from, to: range.to };
  const label = rangeLabel(range);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard', 'crm', rq], queryFn: () => api(`/crm/dashboard${toQuery(rq)}`), refetchInterval: 60_000, placeholderData: keepPreviousData });
  // Pipeline register counts Website / App leads only; Meta (and future connectors) have their own section below.
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines', 'website', rq], queryFn: () => api(`/crm/pipelines${toQuery({ ...rq, channel: 'website' })}`), refetchInterval: 60_000, placeholderData: keepPreviousData });
  const canMeta = can('lead.channel.meta');
  const { data: metaPipe } = useQuery({
    queryKey: ['leads', 'pipelines', 'meta', rq], queryFn: () => api(`/crm/pipelines${toQuery({ ...rq, channel: 'meta' })}`),
    enabled: canMeta, refetchInterval: 60_000, placeholderData: keepPreviousData,
  });
  const [recvCh, setRecvCh] = useState('all');
  const recvChannels = [['all', 'All'], ['website', 'Website / App'], ...(canMeta ? [['meta', 'Meta']] : []), ...(can('lead.channel.client') ? [['client', 'Client']] : [])];
  const { data: received } = useQuery({
    queryKey: ['leads', 'dash-received', rq, recvCh],
    queryFn: () => api(`/crm/leads${toQuery({ ...rq, ...(recvCh !== 'all' ? { channel: recvCh } : {}), limit: 10, sort: 'received_at', dir: 'desc' })}`),
    refetchInterval: 60_000, placeholderData: keepPreviousData,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>;

  const { mine, team, activity } = data;
  const counts = pipe?.counts || {};
  const totals = PIPELINE_ORDER.reduce((a, k) => {
    Object.entries(counts[k] || {}).forEach(([f, v]) => { a[f] = (a[f] || 0) + v; });
    return a;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 border-b pb-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="text-[19px] font-semibold text-slate-900">{greeting()}, {me?.user?.full_name?.split(' ')[0]} 👋</h1>
          <p className="hidden text-[12px] text-muted-foreground sm:block">Here&apos;s your lead overview. Figures cover the websites you have access to.</p>
        </div>
        <p className="shrink-0 rounded-full border bg-white px-3 py-1 text-[12px] font-medium text-slate-600">{formatDate(new Date())}</p>
      </div>

      {can('integration.manage') && <HomeIntegrations />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="text-[12px] text-slate-500">Showing leads received <span className="font-semibold text-slate-700">{label.toLowerCase().startsWith('last') || label === 'This month' ? label.toLowerCase() : label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : `on ${label}`}</span>. Follow-up figures are always live.</p>
      </div>

      <Panel title={`Pipeline register · ${label}`} action={<Link href={`/crm/leads${toQuery(rq)}`} className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">Open all leads</Link>}>
        {/* Phones: one card per pipeline */}
        <ul className="divide-y divide-slate-100 md:hidden">
          {PIPELINE_ORDER.map((k) => {
            const c = counts[k] || {};
            return (
              <li key={k}>
                <Link href={`/crm/pipeline/${k}`} className="flex items-center gap-3 px-3 py-3 active:bg-slate-50">
                  <PipelineLogo src={PIPELINES[k].logo} className="h-9 w-9 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">{PIPELINES[k].title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      {c.new_leads > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-blue-200">{c.new_leads} new</span>}
                      {c.unassigned > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-200">{c.unassigned} unassigned</span>}
                      {c.overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-red-200">{c.overdue} overdue</span>}
                      {c.today > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{c.today} today</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-semibold leading-none tabular-nums text-slate-900">{c.total ?? 0}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{c.total ? `${((c.converted / c.total) * 100).toFixed(1)}% conv.` : 'leads'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-[13px]">
            <thead className="bg-[hsl(214_25%_96%)] text-[11px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Pipeline</th>
                {['Leads', 'New', 'Received today', 'Unassigned', 'Overdue follow-ups', 'Converted', 'Conversion'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {PIPELINE_ORDER.map((k) => {
                const c = counts[k] || {};
                return (
                  <tr key={k} className="hover:bg-[hsl(213_60%_97%)]">
                    <td className="px-3 py-2"><Link href={`/crm/pipeline/${k}`} className="flex items-center gap-2 font-semibold text-[hsl(var(--primary))] hover:underline"><PipelineLogo src={PIPELINES[k].logo} className="h-5 w-5" />{PIPELINES[k].title}</Link></td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{c.total ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.new_leads ? <Link className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100" href={`/crm/pipeline/${k}?view=new`}>{c.new_leads}</Link> : 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.today ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.unassigned ? <Link className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100" href={`/crm/pipeline/${k}?view=unassigned`}>{c.unassigned}</Link> : 0}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', c.overdue && 'font-semibold text-red-700')}>{c.overdue ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{c.converted ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.total ? `${((c.converted / c.total) * 100).toFixed(1)}%` : '—'}</td>
                    <td className="px-2"><Link href={`/crm/pipeline/${k}`} aria-label={`Open ${PIPELINES[k].title}`}><ArrowRight className="h-4 w-4 text-slate-400" /></Link></td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.total ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.new_leads ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.today ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.unassigned ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.overdue ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.converted ?? 0}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{totals.total ? `${((totals.converted / totals.total) * 100).toFixed(1)}%` : '—'}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {canMeta && (
        <div>
          <h2 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
            <MetaMark className="h-3.5 w-3.5" />Meta leads · {label}
            <Link href="/crm/meta" className="ml-auto text-[12px] font-medium normal-case tracking-normal text-[hsl(var(--primary))] hover:underline">Open Meta leads</Link>
          </h2>
          {(() => {
            const m = PIPELINE_ORDER.reduce((a, k) => {
              Object.entries(metaPipe?.counts?.[k] || {}).forEach(([f, v]) => { a[f] = (a[f] || 0) + v; });
              return a;
            }, {});
            return (
              <Strip items={[
                ['Meta leads', m.total, null, '/crm/meta', Users],
                ['New', m.new_leads, 'info', '/crm/meta?view=new', Sparkles],
                ['Received today', m.today, null, null, CalendarCheck],
                ['Unassigned', m.unassigned, 'warn', '/crm/meta?view=unassigned', UserX],
                ['Overdue follow-ups', m.overdue, 'danger', null, AlertTriangle],
                ['Converted', m.converted, 'success', null, TrendingUp],
              ]} />
            );
          })()}
        </div>
      )}

      <div>
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">My work</h2>
        <Strip items={[
          [`My leads · ${label}`, mine.leads.total, null, `/crm/leads${toQuery({ view: 'mine', ...rq })}`, Users],
          ['New', mine.leads.new_leads, 'info', null, Sparkles],
          ["Today's follow-ups", mine.followups.today, null, '/crm/followups', CalendarCheck],
          ['Overdue', mine.followups.overdue, 'danger', '/crm/followups', AlertTriangle],
          ['Upcoming', mine.followups.upcoming, null, null, Clock],
          ['Converted (30 days)', mine.leads.converted_30d, 'success', null, TrendingUp],
        ]} />
      </div>

      {team && (
        <div>
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Team</h2>
          <Strip items={[
            [`Team leads · ${label}`, team.leads.total, null, `/crm/leads${toQuery(rq)}`, Users],
            ['Unassigned', team.leads.unassigned, 'warn', '/crm/leads?view=unassigned', UserX],
            ['New', team.leads.new_leads, 'info', null, Sparkles],
            ['Follow-ups due today', team.followups.due_today, null, null, CalendarCheck],
            ['Overdue follow-ups', team.followups.overdue, 'danger', null, AlertTriangle],
            ['Converted (30 days)', team.leads.converted_30d, 'success', null, TrendingUp],
          ]} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={`Leads received · ${label}`} action={<Link href={`/crm/leads${toQuery({ ...rq, ...(recvCh !== 'all' ? { channel: recvCh } : {}) })}`} className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">View all{received?.meta?.total ? ` ${received.meta.total}` : ''}</Link>}>
          <div role="tablist" aria-label="Lead source" className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/50 px-3 py-2">
            {recvChannels.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={recvCh === k} onClick={() => setRecvCh(k)}
                className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition',
                  recvCh === k ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800')}>
                {k !== 'all' && <span className={cn('h-2 w-2 rounded-full', CHANNEL_STYLE[k].bar)} />}{t}
              </button>
            ))}
          </div>
          {!received?.rows?.length ? <EmptyState title={`No ${recvCh === 'all' ? '' : `${recvChannels.find(([k]) => k === recvCh)?.[1]} `}leads ${label === 'Today' ? 'today yet' : 'in this period'}`} description="Pick another source or date range." /> : (
            <ul className="divide-y divide-slate-100">
              {received.rows.map((l) => <DashLeadRow key={l.id} l={l} />)}
            </ul>
          )}
        </Panel>

        <Panel title={`My leads · ${label}`} action={<Link href={`/crm/leads${toQuery({ view: 'mine', ...rq })}`} className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">View all</Link>}>
          {mine.recent.length === 0 ? <EmptyState title="No leads assigned to you in this period" description="Leads assigned to you will show up here." /> : (
            <ul className="divide-y divide-slate-100">
              {mine.recent.map((l) => <DashLeadRow key={l.id} l={l} showOwner={false} />)}
            </ul>
          )}
        </Panel>

        {canMeta && (
          <Panel title={`Meta lead forms · ${label}`} action={<Link href="/crm/meta?tab=forms" className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">All forms</Link>}>
            <MetaLeadFormsList compact limit={8} params={rq} />
          </Panel>
        )}

        {team ? (
          <Panel title="Team performance">
            {team.teamPerformance.length === 0 ? <EmptyState title="No assigned leads yet" /> : (
              <table className="w-full text-[13px]">
                <thead className="bg-[hsl(214_25%_96%)] text-[11px] uppercase tracking-wide text-slate-600"><tr><th className="px-3 py-1.5 text-left font-semibold">Owner</th><th className="px-3 py-1.5 text-right font-semibold">Assigned</th><th className="px-3 py-1.5 text-right font-semibold">Open</th><th className="px-3 py-1.5 text-right font-semibold">Converted</th><th className="px-3 py-1.5 text-right font-semibold">Rate</th></tr></thead>
                <tbody className="divide-y">
                  {team.teamPerformance.map((u) => (
                    <tr key={u.id}><td className="px-3 py-1.5">{u.full_name}</td><td className="px-3 py-1.5 text-right tabular-nums">{u.assigned}</td><td className="px-3 py-1.5 text-right tabular-nums">{u.open_leads}</td><td className="px-3 py-1.5 text-right tabular-nums">{u.converted}</td><td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{u.assigned ? `${((u.converted / u.assigned) * 100).toFixed(0)}%` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        ) : (
          <Panel title="Follow-ups">
            <p className="p-3 text-[13px] text-slate-600">You have {mine.followups.upcoming} upcoming follow-up(s). <Link className="font-medium text-[hsl(var(--primary))] underline" href="/crm/followups">Open follow-ups</Link></p>
          </Panel>
        )}
      </div>

      {activity?.length > 0 && (
        <Panel title="Recent activity">
          <ul className="divide-y">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[13px]">
                <span className="min-w-0 truncate"><span className="font-medium">{a.actor || 'System'}</span> <span className="text-slate-500">· {titleCase(a.type)} ·</span> <Link className="text-[hsl(var(--primary))] hover:underline" href={`/crm/leads/${a.lead_id}`}>{a.lead_name || a.external_lead_id}</Link></span>
                <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
