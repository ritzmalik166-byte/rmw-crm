'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
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

function Strip({ items }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y rounded border bg-white sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
      {items.map(([label, value, tone, href]) => {
        const inner = (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={cn('text-[19px] font-semibold tabular-nums text-slate-900', tone)}>{value ?? 0}</p>
          </>
        );
        return href ? <Link key={label} href={href} className="px-3 py-2 hover:bg-slate-50">{inner}</Link> : <div key={label} className="px-3 py-2">{inner}</div>;
      })}
    </div>
  );
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
      <div className="flex flex-col gap-1 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[17px] font-semibold text-slate-900">Dashboard</h1>
          <p className="text-[12px] text-muted-foreground">Welcome, {me?.user?.full_name}. Figures cover the websites you have access to.</p>
        </div>
        <p className="text-[12px] text-slate-500">{formatDate(new Date())}</p>
      </div>

      <Panel title="Pipeline register" action={<Link href="/crm/leads" className="text-[12px] font-medium text-[hsl(var(--primary))] hover:underline">Open all leads</Link>}>
        <div className="overflow-x-auto">
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
                    <td className="px-3 py-2 text-right tabular-nums">{c.new_leads ? <Link className="font-semibold text-blue-700 hover:underline" href={`/crm/pipeline/${k}?view=new`}>{c.new_leads}</Link> : 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.today ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.unassigned ? <Link className="font-semibold text-amber-700 hover:underline" href={`/crm/pipeline/${k}?view=unassigned`}>{c.unassigned}</Link> : 0}</td>
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
          ['My leads', mine.leads.total, null, '/crm/leads?view=mine'],
          ['New', mine.leads.new_leads, 'text-blue-700'],
          ["Today's follow-ups", mine.followups.today, null, '/crm/followups'],
          ['Overdue', mine.followups.overdue, mine.followups.overdue ? 'text-red-700' : null, '/crm/followups'],
          ['Upcoming', mine.followups.upcoming],
          ['Converted (30 days)', mine.leads.converted_30d, 'text-emerald-700'],
        ]} />
      </div>

      {team && (
        <div>
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Team</h2>
          <Strip items={[
            ['Team leads', team.leads.total],
            ['Unassigned', team.leads.unassigned, team.leads.unassigned ? 'text-amber-700' : null, '/crm/leads?view=unassigned'],
            ['New', team.leads.new_leads, 'text-blue-700'],
            ['Follow-ups due today', team.followups.due_today],
            ['Overdue follow-ups', team.followups.overdue, team.followups.overdue ? 'text-red-700' : null],
            ['Converted (30 days)', team.leads.converted_30d, 'text-emerald-700'],
          ]} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
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
