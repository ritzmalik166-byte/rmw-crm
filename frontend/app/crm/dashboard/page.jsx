'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users2, Sparkles, CalendarClock, AlertTriangle, Trophy, Inbox, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { timeAgo, titleCase } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, WebsiteBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from '@/components/ui/feedback';

export default function CrmDashboard() {
  const { me } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard', 'crm'], queryFn: () => api('/crm/dashboard'), refetchInterval: 60_000 });

  if (isLoading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;

  const { mine, team, activity } = data;
  return (
    <>
      <PageHeader title={`Hello, ${me?.user?.full_name?.split(' ')[0] || 'there'}`} description="Your leads and follow-ups at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="My leads" value={mine.leads.total} icon={Users2} />
        <StatCard label="New" value={mine.leads.new_leads} icon={Sparkles} />
        <StatCard label="Today's follow-ups" value={mine.followups.today} icon={CalendarClock} tone="warning" />
        <StatCard label="Overdue" value={mine.followups.overdue} icon={AlertTriangle} tone={mine.followups.overdue ? 'danger' : undefined} />
        <StatCard label="Converted" value={mine.leads.converted} hint={`${mine.leads.converted_30d} in the last 30 days`} icon={Trophy} tone="success" />
      </div>

      {team && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">Team overview</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Team leads" value={team.leads.total} icon={Inbox} />
            <StatCard label="Unassigned" value={team.leads.unassigned} icon={UserX} tone={team.leads.unassigned ? 'warning' : undefined} />
            <StatCard label="New" value={team.leads.new_leads} icon={Sparkles} />
            <StatCard label="Follow-ups due today" value={team.followups.due_today} icon={CalendarClock} />
            <StatCard label="Overdue follow-ups" value={team.followups.overdue} icon={AlertTriangle} tone={team.followups.overdue ? 'danger' : undefined} />
          </div>
        </>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>My recent leads</CardTitle><Link href="/crm/leads?assignedUserId=me" className="text-xs text-muted-foreground hover:text-foreground">View all</Link></CardHeader>
          <CardContent className="p-0">
            {mine.recent.length === 0 ? <EmptyState title="No leads assigned yet" description="Leads assigned to you will show up here." /> : (
              <ul className="divide-y">
                {mine.recent.map((l) => (
                  <li key={l.id}>
                    <Link href={`/crm/leads/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{l.name || 'Unnamed lead'}</p>
                        <p className="truncate text-xs text-muted-foreground">{l.interest || l.external_lead_id}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2"><WebsiteBadge code={l.website_code} /><StatusBadge name={l.status_name} color={l.status_color} /><span className="w-20 text-right text-xs text-muted-foreground">{timeAgo(l.created_at)}</span></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {team ? (
          <Card>
            <CardHeader><CardTitle>Team performance</CardTitle></CardHeader>
            <CardContent className="p-0">
              {team.teamPerformance.length === 0 ? <EmptyState title="No assigned leads yet" /> : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-5 py-2 text-left font-medium">User</th><th className="px-3 py-2 text-right font-medium">Assigned</th><th className="px-3 py-2 text-right font-medium">Open</th><th className="px-5 py-2 text-right font-medium">Converted</th></tr></thead>
                  <tbody className="divide-y">
                    {team.teamPerformance.map((u) => (
                      <tr key={u.id}><td className="px-5 py-2">{u.full_name}</td><td className="px-3 py-2 text-right tabular-nums">{u.assigned}</td><td className="px-3 py-2 text-right tabular-nums">{u.open_leads}</td><td className="px-5 py-2 text-right tabular-nums">{u.converted}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Follow-ups</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              You have {mine.followups.upcoming} upcoming follow-up(s). <Link className="font-medium text-foreground underline" href="/crm/followups">Open follow-ups</Link>
            </CardContent>
          </Card>
        )}
      </div>

      {activity?.length > 0 && (
        <Card className="mt-5">
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span><span className="font-medium">{a.actor || 'System'}</span> · {titleCase(a.type)} · <Link className="hover:underline" href={`/crm/leads/${a.lead_id}`}>{a.lead_name || a.external_lead_id}</Link></span>
                  <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
