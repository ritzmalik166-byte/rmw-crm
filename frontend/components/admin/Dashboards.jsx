'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users2, UserX, Sparkles, CalendarClock, AlertTriangle, Trophy, Percent, UserPlus, Plug } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo, titleCase } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, WebsiteBadge, WEBSITE_LOGOS } from '@/components/ui/badge';
import { ErrorState, PageHeader, Skeleton, StatCard, EmptyState } from '@/components/ui/feedback';

function ActivityList({ rows }) {
  if (!rows?.length) return <EmptyState title="No activity yet" />;
  return (
    <ul className="divide-y">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
          <span className="min-w-0 truncate"><span className="font-medium">{a.actor || 'System'}</span> · {titleCase(a.type)} · <Link className="hover:underline" href={`/crm/leads/${a.lead_id}`}>{a.lead_name || a.external_lead_id}</Link></span>
          <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamPerf({ rows }) {
  if (!rows?.length) return <EmptyState title="No assigned leads yet" />;
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-2 text-left font-medium">User</th><th className="px-3 py-2 text-right font-medium">Assigned</th><th className="px-3 py-2 text-right font-medium">Open</th><th className="px-5 py-2 text-right font-medium">Converted</th></tr></thead>
      <tbody className="divide-y">{rows.map((u) => <tr key={u.id}><td className="px-5 py-2">{u.full_name}</td><td className="px-3 py-2 text-right tabular-nums">{u.assigned}</td><td className="px-3 py-2 text-right tabular-nums">{u.open_leads}</td><td className="px-5 py-2 text-right tabular-nums">{u.converted}</td></tr>)}</tbody>
    </table>
  );
}

export function AdminDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard', 'crm'], queryFn: () => api('/crm/dashboard'), refetchInterval: 60_000 });
  if (isLoading) return <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;
  const t = data.team;
  return (
    <>
      <PageHeader title="Admin dashboard" description="Team leads, assignment backlog and follow-up health." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard label="Team leads" value={t?.leads.total} icon={Users2} />
        <StatCard label="Unassigned" value={t?.leads.unassigned} icon={UserX} tone={t?.leads.unassigned ? 'warning' : undefined} />
        <StatCard label="New" value={t?.leads.new_leads} icon={Sparkles} />
        <StatCard label="Follow-ups today" value={t?.followups.due_today} icon={CalendarClock} />
        <StatCard label="Overdue" value={t?.followups.overdue} icon={AlertTriangle} tone={t?.followups.overdue ? 'danger' : undefined} />
        <StatCard label="Conversions (30d)" value={t?.leads.converted_30d} icon={Trophy} tone="success" />
      </div>
      {t?.leads.unassigned > 0 && <p className="mt-3 text-sm"><Link className="font-medium underline" href="/crm/leads?assignedUserId=unassigned">Assign the {t.leads.unassigned} unassigned lead(s)</Link></p>}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Team performance</CardTitle></CardHeader><CardContent className="p-0"><TeamPerf rows={t?.teamPerformance} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="p-0"><ActivityList rows={data.activity} /></CardContent></Card>
      </div>
    </>
  );
}

export function SuperAdminDashboard() {
  const [period, setPeriod] = useState('all');
  const iso = (d) => d.toISOString();
  const range = { from: period === 'all' ? '2000-01-01T00:00:00.000Z' : iso(new Date(Date.now() - Number(period) * 86400_000)), to: iso(new Date()) };
  const analytics = useQuery({ queryKey: ['admin', 'analytics', 'sa-dash', period], queryFn: () => api(`/admin/analytics?from=${range.from}&to=${range.to}`), refetchInterval: 120_000 });
  const integrations = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => api('/admin/integrations'), refetchInterval: 60_000 });
  const pending = useQuery({ queryKey: ['admin', 'requests', 'pending-count'], queryFn: () => api('/admin/user-requests?status=PENDING_APPROVAL&limit=1') });
  const dash = useQuery({ queryKey: ['dashboard', 'crm'], queryFn: () => api('/crm/dashboard') });

  if (analytics.isLoading) return <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (analytics.isError) return <Card><ErrorState error={analytics.error} onRetry={analytics.refetch} /></Card>;
  const a = analytics.data;
  const site = (code) => a.byWebsite.find((w) => w.code === code)?.total || 0;

  return (
    <>
      <PageHeader
        title="Super Admin dashboard"
        description={period === 'all' ? 'All leads across every website.' : `Last ${period} days across every website.`}
        actions={
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 rounded border bg-background px-2 text-sm" aria-label="Period">
            <option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option>
          </select>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={a.totals.total.toLocaleString('en-IN')} icon={Users2} />
        <StatCard label="Conversion rate" value={`${a.totals.conversionRate}%`} hint={`${a.totals.converted} converted`} icon={Percent} />
        <StatCard label="Pending account requests" value={pending.data?.meta?.total ?? '—'} icon={UserPlus} tone={pending.data?.meta?.total ? 'warning' : undefined} />
        <StatCard label="Unassigned" value={a.totals.unassigned} icon={UserX} tone={a.totals.unassigned ? 'warning' : undefined} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {['MPF', 'RMW', 'CT'].map((c) => <StatCard key={c} label={`${c} leads`} logo={WEBSITE_LOGOS[c]} value={site(c).toLocaleString('en-IN')} />)}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="flex items-center gap-2"><Plug className="h-4 w-4" />Integration health</CardTitle><Link href="/super-admin/integrations" className="text-xs text-muted-foreground hover:text-foreground">Manage</Link></CardHeader>
          <CardContent className="space-y-2">
            {integrations.data?.map((i) => {
              const bad = Number(i.failed_events) > 0 || (i.last_failure_at && (!i.last_success_at || new Date(i.last_failure_at) > new Date(i.last_success_at)));
              return (
                <div key={i.website_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><WebsiteBadge code={i.code} />{i.last_received_at ? `last lead ${timeAgo(i.last_received_at)}` : 'no leads received yet'}</span>
                  <Badge variant={!i.api_key_prefix ? 'warning' : bad ? 'danger' : 'success'}>{!i.api_key_prefix ? 'No key' : bad ? 'Errors' : 'OK'}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Leads by source</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {a.bySource.slice(0, 8).map((s, i) => <div key={i} className="flex justify-between"><span className="truncate">{s.source}{s.medium && s.medium !== 'none' ? ` / ${s.medium}` : ''}</span><span className="tabular-nums text-muted-foreground">{s.total}</span></div>)}
            {!a.bySource.length && <p className="text-muted-foreground">No data</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top campaigns</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {a.byCampaign.slice(0, 8).map((c, i) => <div key={i} className="flex justify-between"><span className="truncate">{c.campaign}</span><span className="tabular-nums text-muted-foreground">{c.total}</span></div>)}
            {!a.byCampaign.length && <p className="text-muted-foreground">No campaign-tagged leads</p>}
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads by status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">{a.byStatus.map((s) => <div key={s.code} className="flex justify-between"><span>{s.name}</span><span className="tabular-nums text-muted-foreground">{s.total}</span></div>)}</CardContent>
        </Card>
        <Card><CardHeader><CardTitle>User performance</CardTitle></CardHeader><CardContent className="p-0"><TeamPerf rows={a.byUser.map((u) => ({ id: u.id, full_name: u.full_name, assigned: u.total, open_leads: u.open_leads, converted: u.converted }))} /></CardContent></Card>
      </div>
      <Card className="mt-5"><CardHeader><CardTitle>Recent activity</CardTitle></CardHeader><CardContent className="p-0"><ActivityList rows={dash.data?.activity} /></CardContent></Card>
    </>
  );
}
