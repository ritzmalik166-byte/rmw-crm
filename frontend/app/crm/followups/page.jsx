'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { cn, formatDateTime, titleCase, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, WebsiteBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';

const PRIORITY = { LOW: 'secondary', MEDIUM: 'info', HIGH: 'warning', URGENT: 'danger' };

export default function FollowupsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('today');
  const [scope, setScope] = useState('mine');
  const [page, setPage] = useState(1);
  const q = { status: status === 'all' ? '' : status, scope, page, limit: 25 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['followups', q], queryFn: () => api(`/crm/followups${toQuery(q)}`), placeholderData: keepPreviousData });
  const complete = useMutation({
    mutationFn: (id) => api(`/crm/followups/${id}`, { method: 'PATCH', body: { status: 'COMPLETED' } }),
    onSuccess: () => { toast.success('Follow-up completed'); qc.invalidateQueries({ queryKey: ['followups'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader title="Follow-ups" description="Scheduled calls and actions on your leads. Reminders arrive 30 minutes before they're due." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} className="min-w-0 max-w-full">
          <TabsList className="max-w-full overflow-x-auto [scrollbar-width:none]">
            <TabsTrigger value="today">Due today</TabsTrigger>
            <TabsTrigger value="OVERDUE">Overdue</TabsTrigger>
            <TabsTrigger value="UPCOMING">Upcoming</TabsTrigger>
            <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        {can('lead.view_all') && (
          <Tabs value={scope} onValueChange={(v) => { setScope(v); setPage(1); }}>
            <TabsList><TabsTrigger value="mine">Mine</TabsTrigger><TabsTrigger value="all">Everyone</TabsTrigger></TabsList>
          </Tabs>
        )}
      </div>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No follow-ups here" description="Schedule follow-ups from a lead's page." /> : (
          <>
          {/* Phones: one card per follow-up with a thumb-sized Done button. */}
          <ul className="divide-y md:hidden">
            {data.rows.map((f) => (
              <li key={f.id} className={cn('flex items-start gap-3 px-4 py-3', f.status === 'OVERDUE' && 'bg-red-50/40')}>
                <Link href={`/crm/leads/${f.lead_id}`} className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-slate-900">{f.lead_name || f.external_lead_id}</span>
                    <WebsiteBadge code={f.website_code} />
                  </div>
                  <p className={cn('mt-0.5 text-[13px] tabular-nums', f.status === 'OVERDUE' ? 'font-medium text-red-700' : 'text-slate-600')}>{formatDateTime(f.due_at)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={f.status === 'OVERDUE' ? 'danger' : f.status === 'COMPLETED' ? 'success' : 'info'}>{titleCase(f.status)}</Badge>
                    <Badge variant={PRIORITY[f.priority]}>{titleCase(f.priority)}</Badge>
                    {scope === 'all' && f.owner && <span className="text-[12px] text-slate-500">{f.owner}</span>}
                  </div>
                  {f.notes && <p className="mt-1 line-clamp-2 text-[13px] text-slate-600 [overflow-wrap:anywhere]">{f.notes}</p>}
                </Link>
                {['UPCOMING', 'OVERDUE'].includes(f.status) && <Button variant="outline" className="h-10 shrink-0" onClick={() => complete.mutate(f.id)} loading={complete.isPending && complete.variables === f.id}><CheckCircle2 />Done</Button>}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table>
            <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>Lead</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead>{scope === 'all' && <TableHead>Owner</TableHead>}<TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(f.due_at)}</TableCell>
                  <TableCell><Link className="font-medium hover:underline" href={`/crm/leads/${f.lead_id}`}>{f.lead_name || f.external_lead_id}</Link> <WebsiteBadge code={f.website_code} /></TableCell>
                  <TableCell><Badge variant={PRIORITY[f.priority]}>{titleCase(f.priority)}</Badge></TableCell>
                  <TableCell><Badge variant={f.status === 'OVERDUE' ? 'danger' : f.status === 'COMPLETED' ? 'success' : 'info'}>{titleCase(f.status)}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{f.notes || '—'}</TableCell>
                  {scope === 'all' && <TableCell className="text-sm">{f.owner}</TableCell>}
                  <TableCell className="text-right">
                    {['UPCOMING', 'OVERDUE'].includes(f.status) && <Button size="sm" variant="outline" onClick={() => complete.mutate(f.id)} loading={complete.isPending && complete.variables === f.id}><CheckCircle2 />Done</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}
