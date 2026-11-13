'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users, Sparkles, CalendarCheck, AlertTriangle, Clock, TrendingUp, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { PIPELINES, PIPELINE_ORDER, PipelineLogo } from '@/lib/pipelines';
import { cn, timeAgo, titleCase, formatDate } from '@/lib/utils';
import { StatusBadge, WebsiteBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { DashboardSkeleton } from '@/components/ui/skeletons';


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

export default function CrmDashboard() {
  const { me } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard', 'crm'], queryFn: () => api('/crm/dashboard'), refetchInterval: 60_000 });
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines'], queryFn: () => api('/crm/pipelines'), refetchInterval: 60_000 });

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

      <Panel title="Pipeline register" action={<Link href="/crm/leads" className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">Open all leads</Link>}>
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
                {['Total', 'New', 'Received today', 'Unassigned', 'Overdue follow-ups', 'Converted', 'Conversion'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}
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

      <div>
        <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">My work</h2>
        <Strip items={[
          ['My leads', mine.leads.total, null, '/crm/leads?view=mine', Users],
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
            ['Team leads', team.leads.total, null, null, Users],
            ['Unassigned', team.leads.unassigned, 'warn', '/crm/leads?view=unassigned', UserX],
            ['New', team.leads.new_leads, 'info', null, Sparkles],
            ['Follow-ups due today', team.followups.due_today, null, null, CalendarCheck],
            ['Overdue follow-ups', team.followups.overdue, 'danger', null, AlertTriangle],
            ['Converted (30 days)', team.leads.converted_30d, 'success', null, TrendingUp],
          ]} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="My recent leads" action={<Link href="/crm/leads?view=mine" className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">View all</Link>}>
          {mine.recent.length === 0 ? <EmptyState title="No leads assigned yet" description="Leads assigned to you will show up here." /> : (
            <ul className="divide-y">
              {mine.recent.map((l) => (
                <li key={l.id}>
                  <Link href={`/crm/leads/${l.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[hsl(213_60%_97%)]">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[hsl(var(--primary))]">{l.name || 'Unnamed lead'}</p>
                      <p className="truncate text-[11px] text-slate-500">{l.interest || l.external_lead_id}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2"><WebsiteBadge code={l.website_code} /><StatusBadge name={l.status_name} color={l.status_color} /><span className="w-20 text-right text-[11px] text-slate-500">{timeAgo(l.created_at)}</span></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

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
