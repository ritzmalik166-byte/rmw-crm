'use client';
import { useUiVersion } from '@/lib/useUiVersion';
import { LegacyDashboard } from '@/components/legacy/Dashboard';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, Users, Sparkles, CalendarCheck, CalendarDays, AlertTriangle, AlarmClock, Clock, TrendingUp, UserX, UserRound, Plus, Link2, Workflow, BarChart3, Briefcase, UsersRound, Activity, CheckCircle2, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { PIPELINES, PIPELINE_ORDER, PipelineLogo } from '@/lib/pipelines';
import { cn, timeAgo, titleCase, formatDate, toQuery } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { DashboardSkeleton } from '@/components/ui/skeletons';
import { DateRangeFilter, rangeLabel, todayRange, previousRange } from '@/components/ui/date-range';
import { MetaLeadFormsList } from '@/components/marketing/MetaLeadForms';
import { MetaMark } from '@/components/integrations/MetaLogo';
import { GoogleAdsLogo, WhatsAppLogo, WebsiteLogo } from '@/components/integrations/BrandLogos';
import { LeadSourceChip, leadChannel, CHANNEL_STYLE } from '@/components/leads/LeadSource';
import { IntegrationMarketplace } from '@/components/integrations/IntegrationMarketplace';
import { AnimatedNumber, Delta, InfoTip, KpiCard } from '@/components/dashboard/widgets';

const AVATAR_TONE = { meta: 'from-blue-500 to-indigo-600', client: 'from-violet-500 to-fuchsia-600', website: 'from-teal-500 to-emerald-600' };
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
const sum = (counts) => PIPELINE_ORDER.reduce((a, k) => {
  Object.entries(counts?.[k] || {}).forEach(([f, v]) => { a[f] = (a[f] || 0) + v; });
  return a;
}, {});
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');


function DashLeadRow({ l, showOwner = true }) {
  const ch = leadChannel(l);
  return (
    <li>
      <Link href={`/crm/leads/${l.id}`} className="group relative flex items-center gap-3 px-5 py-3 transition-colors duration-200 hover:bg-slate-50/80">
        <span aria-hidden className={cn('absolute inset-y-2.5 left-0 w-[3px] rounded-r-full opacity-60 transition-opacity duration-200 group-hover:opacity-100', CHANNEL_STYLE[ch].bar)} />
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[12px] font-semibold text-white ring-2 ring-white', AVATAR_TONE[ch])}>{initials(l.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13.5px] font-semibold text-slate-900 transition-colors duration-200 group-hover:text-primary">{l.name || 'Unnamed lead'}</p>
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

const OpenLink = ({ href, children }) => (
  <Link href={href} className="group inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:text-[hsl(var(--primary)/0.8)]">
    {children}<ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)] group-hover:translate-x-0.5" />
  </Link>
);

function Panel({ title, icon: Icon, action, children, className }) {
  return (
    <section className={cn('panel overflow-hidden', className)}>
      <div className="panel-head">
        <h2 className="panel-title">{Icon && <Icon className="h-[18px] w-[18px] text-slate-500" strokeWidth={1.9} />}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small uppercase label above a group of KPI cards, with an optional link on the right. */
function SectionLabel({ icon: Icon, children, action }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {Icon && <Icon className="h-4 w-4 text-primary" strokeWidth={2} />}{children}
      </h2>
      {action}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** One integration tile: brand mark, name and live status. Not-yet-connected tiles open the marketplace. */
function IntegrationTile({ logo, name, connected, detail, onClick, href, wide }) {
  const inner = (
    <>
      <span className={cn('flex shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80', wide ? 'h-12 w-12' : 'h-10 w-10')}>{logo}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-2">
          <span className={cn('truncate font-semibold text-slate-900', wide ? 'text-[15px]' : 'text-[13.5px]')}>{name}</span>
          {wide && <Status connected={connected} />}
        </span>
        {wide
          ? <span className="mt-1 block truncate text-[12.5px] text-slate-500">{detail}</span>
          : <span className="mt-1 block"><Status connected={connected} /></span>}
      </span>
    </>
  );
  const cls = cn('gloss gloss-hover flex min-w-0 items-center gap-3 rounded-xl px-3.5 py-3 text-left', wide ? 'sm:col-span-2' : '');
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

const Status = ({ connected }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-medium', connected ? 'text-emerald-600' : 'text-slate-400')}>
    <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]' : 'bg-slate-300')} />
    {connected ? 'Connected' : 'Not connected'}
  </span>
);

/** Home-page integrations card for users granted "Manage integrations". */
function HomeIntegrations() {
  const [market, setMarket] = useState(false);
  const { data: s } = useQuery({ queryKey: ['meta', 'status'], queryFn: () => api('/manage/integrations/meta/status'), staleTime: 60_000 });
  const pages = s?.connection?.pages || [];
  const metaConnected = Boolean(s) && !['NOT_CONNECTED', 'NOT_CONFIGURED'].includes(s.state);
  const openMarket = () => setMarket(true);
  return (
    <section className="panel crm-fade overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-primary"><Link2 className="h-5 w-5" strokeWidth={2} /></span>
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-900">Integrations</h2>
            <p className="text-[12.5px] text-slate-500">Manage your connected platforms and data sources.</p>
          </div>
        </div>
        <button type="button" onClick={openMarket}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-semibold text-white shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.65)] hover:bg-[hsl(var(--primary)/0.9)]">
          <Plus className="h-4 w-4" strokeWidth={2.25} />Add Integration
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 p-5 pt-4 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        <IntegrationTile wide href="/crm/integrations" logo={<MetaMark className="h-7 w-7" />} name="Meta" connected={metaConnected}
          detail={pages.length ? pages.map((p) => p.name).join(', ') : metaConnected ? 'No Page switched on yet' : 'Connect once to bring in all your Pages'} />
        <IntegrationTile logo={<GoogleAdsLogo />} name="Google Ads" connected={false} onClick={openMarket} />
        <IntegrationTile logo={<WhatsAppLogo />} name="WhatsApp" connected={false} onClick={openMarket} />
        <IntegrationTile logo={<img src="/brands/linkedin.svg" alt="" aria-hidden className="h-6 w-6 object-contain" />} name="LinkedIn" connected={false} onClick={openMarket} />
        <IntegrationTile logo={<WebsiteLogo />} name="Website" connected href="/crm/integrations" />
      </div>
      {market && <IntegrationMarketplace open onOpenChange={setMarket} onManageMeta={() => { window.location.href = '/crm/integrations?open=pages'; }} />}
    </section>
  );
}

function TodayFocus({ items }) {
  const live = items.filter((i) => i.show !== false);
  const pending = live.filter((i) => i.value > 0);
  return (
    <section className="panel crm-fade overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="flex items-center gap-2 text-[14.5px] font-semibold tracking-tight text-slate-900">
          <Target className="h-[18px] w-[18px] text-primary" strokeWidth={2} />Today&apos;s priorities
        </h2>
        <p className="text-[12px] text-slate-400">{pending.length ? 'Click any item to work through it.' : 'Updated live'}</p>
      </div>
      {pending.length === 0 ? (
        <div className="m-5 mt-3 flex items-center gap-3 rounded-xl bg-emerald-50/70 px-4 py-3.5 text-[13px] text-emerald-800 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <span><span className="font-semibold">You&apos;re all caught up.</span> No overdue follow-ups or leads waiting on you right now.</span>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 p-5 pt-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          {live.map((i) => {
            const t = FOCUS_TONES[i.tone];
            const idle = !i.value;
            return (
              <li key={i.key}>
                <Link href={i.href} className={cn('group flex items-center gap-3 rounded-xl border px-4 py-3 transition-[background-color,border-color,box-shadow] duration-300',
                  idle ? 'border-slate-200/70 bg-slate-50/50 hover:border-slate-300' : cn('bg-white hover:shadow-[0_8px_20px_-12px_rgb(16_24_40/0.25)]', t.border))}>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', idle ? 'bg-slate-100 text-slate-400' : t.chip)}><i.icon className="h-[18px] w-[18px]" strokeWidth={2} /></span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <AnimatedNumber value={i.value} className={cn('block text-[20px] font-semibold', idle ? 'text-slate-400' : 'text-slate-900')} />
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">{i.label}</span>
                  </span>
                  <ArrowRight className={cn('h-4 w-4 shrink-0 transition-[transform,color] duration-300 group-hover:translate-x-0.5', idle ? 'text-slate-300' : t.arrow)} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const FOCUS_TONES = {
  red: { chip: 'bg-red-50 text-red-600', border: 'border-red-200/80 hover:border-red-300', arrow: 'text-red-500' },
  indigo: { chip: 'bg-indigo-50 text-indigo-600', border: 'border-indigo-200/80 hover:border-indigo-300', arrow: 'text-indigo-500' },
  amber: { chip: 'bg-amber-50 text-amber-600', border: 'border-amber-200/80 hover:border-amber-300', arrow: 'text-amber-500' },
  blue: { chip: 'bg-blue-50 text-blue-600', border: 'border-blue-200/80 hover:border-blue-300', arrow: 'text-blue-500' },
};

const REGISTER_COLS = [
  ['total', 'Leads', 'All leads received in the selected period'],
  ['new_leads', 'New', 'Leads still in the New status (not yet worked)'],
  ['today', 'Today', 'Received today: leads that arrived today'],
  ['unassigned', 'Unassigned', 'Leads with no owner yet'],
  ['overdue', 'Overdue', 'Overdue follow-ups: leads with a follow-up past its due time'],
  ['converted', 'Converted', 'Leads moved to a converted status'],
];

/** KPI rows wrap by available width (6 across on wide screens, fewer as space shrinks), never squeezing cards. */
const KPI_GRID = 'grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(176px,1fr))]';

function RegisterCell({ k, field, value }) {
  if (field === 'new_leads' && value) return <Link className="rounded-full bg-blue-50 px-2.5 py-0.5 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100" href={`/crm/pipeline/${k}?view=new`}><AnimatedNumber value={value} /></Link>;
  if (field === 'unassigned' && value) return <Link className="rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 hover:bg-amber-100" href={`/crm/pipeline/${k}?view=unassigned`}><AnimatedNumber value={value} /></Link>;
  return <AnimatedNumber value={value ?? 0} className={cn(field === 'converted' && 'font-semibold text-emerald-600', field === 'overdue' && value && 'font-semibold text-red-600', field === 'total' && 'font-medium text-slate-900')} />;
}

function CrmDashboardV2() {
  const { me, can } = useAuth();
  const [range, setRange] = useState(todayRange);
  const rq = { from: range.from, to: range.to };
  const prev = previousRange(range);
  const prq = { from: prev.from, to: prev.to };
  const label = rangeLabel(range);
  const { data, isLoading, isError, error, refetch, isPlaceholderData } = useQuery({ queryKey: ['dashboard', 'crm', rq], queryFn: () => api(`/crm/dashboard${toQuery(rq)}`), refetchInterval: 60_000, placeholderData: keepPreviousData });
  // Pipeline register counts Website / App leads only; Meta (and future connectors) have their own section below.
  const pipeQ = useQuery({ queryKey: ['leads', 'pipelines', 'website', rq], queryFn: () => api(`/crm/pipelines${toQuery({ ...rq, channel: 'website' })}`), refetchInterval: 60_000, placeholderData: keepPreviousData });
  const canMeta = can('lead.channel.meta');
  const metaQ = useQuery({
    queryKey: ['leads', 'pipelines', 'meta', rq], queryFn: () => api(`/crm/pipelines${toQuery({ ...rq, channel: 'meta' })}`),
    enabled: canMeta, refetchInterval: 60_000, placeholderData: keepPreviousData,
  });
  // Same counts for the period just before, for the "vs yesterday / previous N days" comparison.
  const metaPrevQ = useQuery({
    queryKey: ['leads', 'pipelines', 'meta', prq], queryFn: () => api(`/crm/pipelines${toQuery({ ...prq, channel: 'meta' })}`),
    enabled: canMeta, staleTime: 5 * 60_000, placeholderData: keepPreviousData,
  });
  // Real leads-per-day for the last 7 days (sparklines).
  const { data: metaTrend } = useQuery({ queryKey: ['leads', 'trend', 'meta'], queryFn: () => api('/crm/trend?channel=meta&days=7'), enabled: canMeta, refetchInterval: 5 * 60_000 });
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
  const counts = pipeQ.data?.counts || {};
  const totals = sum(counts);
  const m = sum(metaQ.data?.counts);
  const mp = metaPrevQ.data ? sum(metaPrevQ.data.counts) : null;
  const days = metaTrend?.days || [];
  const series = (f) => (days.length ? days.map((d) => d[f]) : undefined);
  const yesterdayTotal = days.length > 1 ? days[days.length - 2].total : undefined;
  const settle = (q) => (q?.isPlaceholderData && q?.isFetching ? 'crm-refreshing' : 'crm-settled');
  const periodText = label === 'Today' || label === 'Yesterday' || label.toLowerCase().startsWith('last') || label === 'This month' ? label.toLowerCase() : `on ${label}`;

  // Managers see the team picture first; everyone else starts with their own work.
  const isManager = Boolean(team);
  const focusItems = [
    { key: 'overdue', icon: AlarmClock, tone: 'red', value: mine.followups.overdue, label: 'Overdue follow-ups', href: '/crm/followups' },
    { key: 'today', icon: CalendarCheck, tone: 'indigo', value: mine.followups.today, label: "Follow-ups due today", href: '/crm/followups' },
    { key: 'unassigned', icon: UserX, tone: 'amber', value: team?.leads.unassigned || 0, label: 'Leads waiting for an owner', href: '/crm/leads?view=unassigned', show: isManager && can('lead.view_all') },
    { key: 'new', icon: Sparkles, tone: 'blue', value: mine.leads.new_leads, label: `New leads assigned to you · ${label}`, href: `/crm/leads${toQuery({ view: 'mine', ...rq })}` },
  ];

  const registerSection = (
    <>
      {/* Pipeline register */}
      <Panel title={<>Pipeline Register <span className="font-normal text-slate-400">·</span> {label}</>} icon={Workflow} action={<OpenLink href={`/crm/leads${toQuery(rq)}`}>Open all leads</OpenLink>} className={settle(pipeQ)}>
        {/* Phones & tablets: one card per pipeline (2-up on tablets). The full table needs ~1000px. */}
        <ul className="divide-y divide-slate-100 md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:p-4 xl:hidden">
          {PIPELINE_ORDER.map((k) => {
            const c = counts[k] || {};
            return (
              <li key={k}>
                <Link href={`/crm/pipeline/${k}`} className="flex items-center gap-3 px-4 py-3.5 transition-[background-color,border-color,box-shadow] duration-200 active:bg-slate-50 md:rounded-xl md:border md:border-slate-200/80 md:hover:border-slate-300 md:hover:shadow-[0_6px_18px_-10px_rgb(16_24_40/0.2)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200"><PipelineLogo src={PIPELINES[k].logo} className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-900">{PIPELINES[k].title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                      {c.new_leads > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">{c.new_leads} new</span>}
                      {c.unassigned > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">{c.unassigned} unassigned</span>}
                      {c.overdue > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-inset ring-red-200">{c.overdue} overdue</span>}
                      {c.today > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{c.today} today</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <AnimatedNumber value={c.total ?? 0} className="block text-[20px] font-semibold leading-none text-slate-900" />
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{c.total ? `${pct(c.converted, c.total)} conv.` : 'leads'}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto px-5 pb-4 pt-2 xl:block">
          <table className="w-full text-[13.5px]">
            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-[0.06em]">
              <tr>
                <th className="rounded-l-lg px-3 py-3 text-left font-semibold">Pipeline</th>
                {REGISTER_COLS.map(([f, h, tip]) => <th key={f} className="whitespace-nowrap px-3 py-3 text-center font-semibold"><span className="inline-flex items-center gap-1.5">{h}<InfoTip text={tip} /></span></th>)}
                <th className="whitespace-nowrap px-3 py-3 text-center font-semibold"><span className="inline-flex items-center gap-1.5">Conversion<InfoTip text="Converted ÷ leads in the period" /></span></th>
                <th className="rounded-r-lg px-3 py-3 text-right font-semibold"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PIPELINE_ORDER.map((k) => {
                const c = counts[k] || {};
                return (
                  <tr key={k} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-3 py-3"><Link href={`/crm/pipeline/${k}`} className="inline-flex items-center gap-2.5 font-semibold text-primary hover:text-[hsl(var(--primary)/0.8)]"><PipelineLogo src={PIPELINES[k].logo} className="h-6 w-6" />{PIPELINES[k].title}</Link></td>
                    {REGISTER_COLS.map(([f]) => <td key={f} className="px-3 py-3 text-center"><RegisterCell k={k} field={f} value={c[f]} /></td>)}
                    <td className="px-3 py-3 text-center tabular-nums text-slate-500">{pct(c.converted, c.total)}</td>
                    <td className="px-3 py-3 text-right"><Link href={`/crm/pipeline/${k}`} aria-label={`Open ${PIPELINES[k].title}`} className="group inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-primary hover:shadow-[0_1px_2px_rgb(16_24_40/0.08)]"><ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" /></Link></td>
                  </tr>
                );
              })}
              <tr className="font-semibold text-slate-900">
                <td className="px-3 py-3">Total</td>
                {REGISTER_COLS.map(([f]) => <td key={f} className={cn('px-3 py-3 text-center', f === 'converted' && 'text-emerald-600')}><AnimatedNumber value={totals[f] ?? 0} /></td>)}
                <td className="px-3 py-3 text-center tabular-nums text-slate-500">{pct(totals.converted, totals.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
  const metaSection = (
    <>
      {/* Meta leads */}
      {canMeta && (
        <div className={settle(metaQ)}>
          <SectionLabel icon={BarChart3} action={<OpenLink href="/crm/meta">Open Meta leads</OpenLink>}>Meta leads <span className="text-slate-300">·</span> <span className="text-slate-800">{label}</span></SectionLabel>
          <div className={KPI_GRID}>
            <KpiCard label="Meta leads" value={m.total} icon={MetaMark} tone="blue" href="/crm/meta"
              delta={mp && <Delta current={m.total} previous={mp.total} compareLabel={prev.label} />} trend={series('total')} trendLabel="Meta leads per day, last 7 days" />
            <KpiCard label="New" value={m.new_leads} icon={Sparkles} tone="sky" href="/crm/meta?view=new"
              delta={mp && <Delta current={m.new_leads} previous={mp.new_leads} compareLabel={prev.label} />} trend={series('new_leads')} trendLabel="New Meta leads per day, last 7 days" />
            <KpiCard label="Received today" value={m.today} icon={CalendarCheck} tone="indigo"
              delta={yesterdayTotal !== undefined && <Delta current={m.today} previous={yesterdayTotal} compareLabel="yesterday" />} trend={series('total')} trendLabel="Meta leads received per day, last 7 days" />
            <KpiCard label="Unassigned" value={m.unassigned} icon={UserRound} tone="amber" href="/crm/meta?view=unassigned"
              delta={mp && <Delta current={m.unassigned} previous={mp.unassigned} compareLabel={prev.label} goodWhenUp={false} />} trend={series('unassigned')} trendLabel="Meta leads still unassigned, by day received" />
            <KpiCard label="Overdue follow-ups" value={m.overdue} icon={AlarmClock} tone="red"
              delta={mp && <Delta current={m.overdue} previous={mp.overdue} compareLabel={prev.label} goodWhenUp={false} />} />
            <KpiCard label="Converted" value={m.converted} icon={TrendingUp} tone="green"
              delta={mp && <Delta current={m.converted} previous={mp.converted} compareLabel={prev.label} />} trend={series('converted')} trendLabel="Meta leads converted, by day received" />
          </div>
        </div>
      )}
    </>
  );
  const myWorkSection = (
    <>
      {/* My work */}
      <div className={isPlaceholderData ? 'crm-refreshing' : 'crm-settled'}>
        <SectionLabel icon={Briefcase}>My work</SectionLabel>
        <div className={KPI_GRID}>
          <KpiCard label={`My leads · ${label}`} value={mine.leads.total} icon={Users} tone="blue" href={`/crm/leads${toQuery({ view: 'mine', ...rq })}`} />
          <KpiCard label="New" value={mine.leads.new_leads} icon={Sparkles} tone="sky" />
          <KpiCard label="Today's follow-ups" value={mine.followups.today} icon={CalendarCheck} tone="indigo" href="/crm/followups" />
          <KpiCard label="Overdue" value={mine.followups.overdue} icon={AlertTriangle} tone="red" href="/crm/followups" />
          <KpiCard label="Upcoming" value={mine.followups.upcoming} icon={Clock} tone="slate" />
          <KpiCard label="Converted (30 days)" value={mine.leads.converted_30d} icon={TrendingUp} tone="green" />
        </div>
      </div>
    </>
  );
  const teamSection = (
    <>
      {team && (
        <div className={isPlaceholderData ? 'crm-refreshing' : 'crm-settled'}>
          <SectionLabel icon={UsersRound}>Team</SectionLabel>
          <div className={KPI_GRID}>
            <KpiCard label={`Team leads · ${label}`} value={team.leads.total} icon={Users} tone="blue" href={`/crm/leads${toQuery(rq)}`} />
            <KpiCard label="Unassigned" value={team.leads.unassigned} icon={UserX} tone="amber" href="/crm/leads?view=unassigned" />
            <KpiCard label="New" value={team.leads.new_leads} icon={Sparkles} tone="sky" />
            <KpiCard label="Follow-ups due today" value={team.followups.due_today} icon={CalendarCheck} tone="indigo" />
            <KpiCard label="Overdue follow-ups" value={team.followups.overdue} icon={AlarmClock} tone="red" />
            <KpiCard label="Converted (30 days)" value={team.leads.converted_30d} icon={TrendingUp} tone="green" />
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[24px] font-bold tracking-tight text-slate-900 sm:text-[28px]">
            <span aria-hidden className="text-[26px] sm:text-[30px]">👋</span>{greeting()}, {me?.user?.full_name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-[13.5px] text-slate-500">Here&apos;s your lead overview. Figures cover the websites you have access to.</p>
        </div>
        <p className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[13px] font-medium text-slate-700 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
          <CalendarDays className="h-4 w-4 text-slate-500" strokeWidth={1.9} />{formatDate(new Date())}
        </p>
      </div>

      <TodayFocus items={focusItems} />

      {can('integration.manage') && <HomeIntegrations />}

      {/* Range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="flex items-center gap-2 text-[12.5px] text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129/0.15)]" />
          <span>Showing leads received <span className="font-semibold text-slate-700">{periodText}</span>.</span>
          <span className="hidden text-slate-400 md:inline">Follow-up figures are always live.</span>
        </p>
      </div>

      {isManager
        ? <>{registerSection}{metaSection}{teamSection}{myWorkSection}</>
        : <>{myWorkSection}{registerSection}{metaSection}</>}

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={`Leads received · ${label}`} icon={Users} action={<OpenLink href={`/crm/leads${toQuery({ ...rq, ...(recvCh !== 'all' ? { channel: recvCh } : {}) })}`}>View all{received?.meta?.total ? ` ${received.meta.total}` : ''}</OpenLink>}>
          <div role="tablist" aria-label="Lead source" className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 py-2.5">
            {recvChannels.map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={recvCh === k} onClick={() => setRecvCh(k)}
                className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors duration-300',
                  recvCh === k ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800')}>
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

        <Panel title={`My leads · ${label}`} icon={UserRound} action={<OpenLink href={`/crm/leads${toQuery({ view: 'mine', ...rq })}`}>View all</OpenLink>}>
          {mine.recent.length === 0 ? <EmptyState title="No leads assigned to you in this period" description="Leads assigned to you will show up here." /> : (
            <ul className="divide-y divide-slate-100">
              {mine.recent.map((l) => <DashLeadRow key={l.id} l={l} showOwner={false} />)}
            </ul>
          )}
        </Panel>

        {canMeta && (
          <Panel title={`Meta lead forms · ${label}`} icon={MetaMark} action={<OpenLink href="/crm/meta?tab=forms">All forms</OpenLink>}>
            <MetaLeadFormsList compact limit={8} params={rq} />
          </Panel>
        )}

        {team ? (
          <Panel title="Team performance" icon={UsersRound}>
            {team.teamPerformance.length === 0 ? <EmptyState title="No assigned leads yet" /> : (
              <div className="overflow-x-auto px-5 pb-4 pt-2">
                <table className="w-full text-[13px]">
                  <thead className="text-[11px] uppercase tracking-[0.06em]"><tr><th className="rounded-l-lg px-3 py-2.5 text-left font-semibold">Owner</th><th className="px-3 py-2.5 text-right font-semibold">Assigned</th><th className="px-3 py-2.5 text-right font-semibold">Open</th><th className="px-3 py-2.5 text-right font-semibold">Converted</th><th className="rounded-r-lg px-3 py-2.5 text-right font-semibold">Rate</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {team.teamPerformance.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70"><td className="px-3 py-2.5 font-medium text-slate-800">{u.full_name}</td><td className="px-3 py-2.5 text-right tabular-nums">{u.assigned}</td><td className="px-3 py-2.5 text-right tabular-nums">{u.open_leads}</td><td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{u.converted}</td><td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{u.assigned ? `${((u.converted / u.assigned) * 100).toFixed(0)}%` : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        ) : (
          <Panel title="Follow-ups" icon={CalendarCheck}>
            <p className="px-5 py-4 text-[13px] text-slate-600">You have {mine.followups.upcoming} upcoming follow-up(s). <Link className="font-medium text-primary underline-offset-2 hover:underline" href="/crm/followups">Open follow-ups</Link></p>
          </Panel>
        )}
      </div>

      {activity?.length > 0 && (
        <Panel title="Recent activity" icon={Activity}>
          <ul className="divide-y divide-slate-100">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] transition-colors duration-200 hover:bg-slate-50/70">
                <span className="min-w-0 truncate"><span className="font-medium text-slate-800">{a.actor || 'System'}</span> <span className="text-slate-500">· {titleCase(a.type)} ·</span> <Link className="text-primary hover:underline" href={`/crm/leads/${a.lead_id}`}>{a.lead_name || a.external_lead_id}</Link></span>
                <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export default function CrmDashboard() { const v = useUiVersion(); if (v === null) return null; return v === 2 ? <CrmDashboardV2 /> : <LegacyDashboard />; }
