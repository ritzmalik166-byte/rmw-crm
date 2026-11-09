'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
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
              <li key={n.id} className={cn('flex items-start justify-between gap-4 px-5 py-3', !n.read_at && 'bg-blue-50/40')}>
                <div className="flex min-w-0 gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-blue-600')} />
                  <div className="min-w-0">
                    {n.link ? <Link href={n.link} onClick={() => !n.read_at && markOne.mutate(n.id)} className="text-sm font-medium hover:underline">{n.title}</Link> : <p className="text-sm font-medium">{n.title}</p>}
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</p>
                  </div>
                </div>
                {!n.read_at && <Button variant="ghost" size="sm" onClick={() => markOne.mutate(n.id)}>Mark read</Button>}
              </li>
            ))}
          </ul>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}
