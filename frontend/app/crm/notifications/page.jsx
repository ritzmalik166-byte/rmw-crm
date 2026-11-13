'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarClock, CheckCheck, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['notifications', 'page', unreadOnly, page],
    queryFn: () => api(`/crm/notifications?page=${page}&limit=25${unreadOnly ? '&unreadOnly=true' : ''}`),
  });
  const done = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markAll = useMutation({ mutationFn: () => api('/crm/notifications/read-all', { method: 'POST' }), onSuccess: done });
  const markOne = useMutation({ mutationFn: (id) => api(`/crm/notifications/${id}/read`, { method: 'POST' }), onSuccess: done });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Lead assignments, follow-up reminders and system messages."
        actions={<><Button variant="outline" asChild><Link href="/crm/settings#notifications">Preferences</Link></Button><Button variant="outline" onClick={() => markAll.mutate()} disabled={!data?.unread}><CheckCheck />Mark all as read</Button></>}
      />
      <Tabs value={unreadOnly ? 'unread' : 'all'} onValueChange={(v) => { setUnreadOnly(v === 'unread'); setPage(1); }} className="mb-4">
        <TabsList><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="unread">Unread{data?.unread ? ` (${data.unread})` : ''}</TabsTrigger></TabsList>
      </Tabs>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={2} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No notifications" /> : (
          <ul className="divide-y">
            {data.rows.map((n) => (
              <li key={n.id} className={cn('flex items-start gap-3 px-4 py-4 sm:px-5 sm:py-3', !n.read_at && 'bg-blue-50/50')}>
                <span className={cn('relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', /lead/i.test(n.title) ? 'bg-blue-50 text-blue-600' : /follow/i.test(n.title) ? 'bg-amber-50 text-amber-600' : /account|user|access/i.test(n.title) ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500')}>
                  {/follow/i.test(n.title) ? <CalendarClock className="h-[18px] w-[18px]" /> : /account|user|access/i.test(n.title) ? <UserPlus className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
                  {!n.read_at && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-blue-600 ring-2 ring-white" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    {n.link ? <Link href={n.link} onClick={() => !n.read_at && markOne.mutate(n.id)} className={cn('text-sm hover:underline', n.read_at ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</Link> : <p className={cn('text-sm', n.read_at ? 'font-medium text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>}
                    <span className="shrink-0 text-xs text-muted-foreground" title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{n.body}</p>}
                  {!n.read_at && <button className="mt-1.5 text-xs font-semibold text-[hsl(var(--primary))]" onClick={() => markOne.mutate(n.id)}>Mark as read</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}
