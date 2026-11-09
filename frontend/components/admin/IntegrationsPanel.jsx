'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, RotateCcw, CheckCircle2, AlertTriangle, CircleSlash, Copy } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, WebsiteBadge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton, Skeleton } from '@/components/ui/feedback';

function health(i) {
  if (!i.is_active) return { label: 'Disabled', variant: 'secondary', icon: CircleSlash };
  if (!i.api_key_prefix) return { label: 'Not configured', variant: 'warning', icon: AlertTriangle };
  const lastFail = i.last_failure_at ? new Date(i.last_failure_at).getTime() : 0;
  const lastOk = i.last_success_at ? new Date(i.last_success_at).getTime() : 0;
  if (lastFail > lastOk || Number(i.failed_events) > 0) return { label: 'Errors', variant: 'danger', icon: AlertTriangle };
  if (!lastOk) return { label: 'Waiting for first lead', variant: 'info', icon: CheckCircle2 };
  return { label: 'Healthy', variant: 'success', icon: CheckCircle2 };
}

function CopyField({ label, value }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
        <code className="flex-1 break-all text-xs">{value}</code>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success('Copied'))} aria-label={`Copy ${label}`}><Copy /></Button>
      </div>
    </div>
  );
}

export function IntegrationsPanel({ canManage = false }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'integrations'], queryFn: () => api('/admin/integrations'), refetchInterval: 30_000 });
  const [evFilter, setEvFilter] = useState({ websiteId: '', status: '', page: 1 });
  const events = useQuery({ queryKey: ['admin', 'integration-events', evFilter], queryFn: () => api(`/admin/integrations/events${toQuery({ ...evFilter, limit: 20 })}`), placeholderData: keepPreviousData });
  const [rotate, setRotate] = useState(null);
  const [newKey, setNewKey] = useState(null);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['admin', 'integrations'] }); qc.invalidateQueries({ queryKey: ['admin', 'integration-events'] }); };
  const rotateM = useMutation({
    mutationFn: ({ websiteId, requireSignature }) => api(`/super-admin/integrations/${websiteId}/rotate-key`, { method: 'POST', body: { requireSignature } }),
    onSuccess: (r) => { setRotate(null); setNewKey(r); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ websiteId, ...body }) => api(`/super-admin/integrations/${websiteId}`, { method: 'PATCH', body }),
    onSuccess: () => { toast.success('Integration updated'); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const retry = useMutation({
    mutationFn: (id) => api(`/super-admin/integrations/events/${id}/retry`, { method: 'POST' }),
    onSuccess: () => { toast.success('Retry queued'); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader title="Integrations" description="Lead webhooks from MPF, RMW and CT. Every delivery is logged, de-duplicated and retried on failure." />
      {isLoading ? <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}</div> : isError ? <Card><ErrorState error={error} onRetry={refetch} /></Card> : (
        <div className="grid gap-4 md:grid-cols-3">
          {data.map((i) => {
            const h = health(i);
            return (
              <Card key={i.website_id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2"><WebsiteBadge code={i.code} />{i.name}</CardTitle>
                  <Badge variant={h.variant}><h.icon className="mr-1 h-3 w-3" />{h.label}</Badge>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Last received</span><span>{i.last_received_at ? timeAgo(i.last_received_at) : 'Never'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Last success</span><span>{i.last_success_at ? timeAgo(i.last_success_at) : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Events (24h)</span><span className="tabular-nums">{i.events_24h}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Processed / failed</span><span className="tabular-nums">{i.success_count} / {i.failure_count}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pending / failed now</span><span className="tabular-nums">{i.pending_events} / {i.failed_events}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Key</span><span className="font-mono text-xs">{i.api_key_prefix ? `${i.api_key_prefix}_…` : 'none'}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">HMAC signature</span><span>{i.require_signature ? 'Required' : 'Optional'}</span></div>
                  {i.last_error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{i.last_error}</p>}
                  {canManage && (
                    <div className="flex items-center justify-between gap-2 border-t pt-3">
                      <label className="flex items-center gap-2 text-xs"><Switch checked={!!i.is_active} onCheckedChange={(v) => update.mutate({ websiteId: i.website_id, isActive: v })} />Accept leads</label>
                      <Button size="sm" variant="outline" onClick={() => setRotate({ websiteId: i.website_id, code: i.code, requireSignature: !!i.require_signature, hasKey: !!i.api_key_prefix })}><KeyRound />{i.api_key_prefix ? 'Rotate key' : 'Generate key'}</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Recent deliveries</CardTitle>
          <div className="flex gap-2">
            <Select className="h-8 w-32" value={evFilter.websiteId} onChange={(e) => setEvFilter({ ...evFilter, websiteId: e.target.value, page: 1 })} aria-label="Website"><option value="">All websites</option>{data?.map((i) => <option key={i.website_id} value={i.website_id}>{i.code}</option>)}</Select>
            <Select className="h-8 w-36" value={evFilter.status} onChange={(e) => setEvFilter({ ...evFilter, status: e.target.value, page: 1 })} aria-label="Status"><option value="">All statuses</option>{['RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED'].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</Select>
          </div>
        </CardHeader>
        {events.isLoading ? <TableSkeleton cols={6} /> : !events.data?.rows?.length ? <EmptyState title="No deliveries yet" description="Deliveries appear here once a website starts sending leads." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Website</TableHead><TableHead>Status</TableHead><TableHead>Lead</TableHead><TableHead>Attempts</TableHead><TableHead>Received</TableHead><TableHead>Error</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {events.data.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.id}</TableCell>
                  <TableCell><WebsiteBadge code={e.website} /></TableCell>
                  <TableCell><Badge variant={e.status === 'FAILED' ? 'danger' : e.status === 'PROCESSED' ? 'success' : e.status === 'DUPLICATE' ? 'secondary' : 'info'}>{e.status.toLowerCase()}</Badge></TableCell>
                  <TableCell>{e.lead_id ? <a className="hover:underline" href={`/crm/leads/${e.lead_id}`}>#{e.lead_id}</a> : '—'}</TableCell>
                  <TableCell>{e.attempts}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.created_at)}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-red-700" title={e.error || ''}>{e.error || ''}</TableCell>
                  <TableCell>{canManage && e.status === 'FAILED' && <Button size="sm" variant="outline" onClick={() => retry.mutate(e.id)}><RotateCcw />Retry</Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination meta={events.data?.meta} onPage={(page) => setEvFilter({ ...evFilter, page })} />
      </Card>

      {rotate && (
        <Dialog open onOpenChange={(o) => !o && setRotate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{rotate.hasKey ? `Rotate ${rotate.code} key` : `Generate ${rotate.code} key`}</DialogTitle>
              <DialogDescription>{rotate.hasKey ? 'The current key stops working immediately. Update the website with the new key straight away.' : 'Generates the API key the website uses to send leads.'}</DialogDescription>
            </DialogHeader>
            <label className="flex items-center gap-2 text-sm"><Switch checked={rotate.requireSignature} onCheckedChange={(v) => setRotate({ ...rotate, requireSignature: v })} />Require HMAC signature on every request</label>
            <DialogFooter><Button variant="outline" onClick={() => setRotate(null)}>Cancel</Button><Button variant={rotate.hasKey ? 'destructive' : 'default'} loading={rotateM.isPending} onClick={() => rotateM.mutate(rotate)}>{rotate.hasKey ? 'Rotate key' : 'Generate key'}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {newKey && (
        <Dialog open onOpenChange={(o) => !o && setNewKey(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{newKey.website} credentials</DialogTitle><DialogDescription>Copy these now. They are stored only as hashes and will not be shown again.</DialogDescription></DialogHeader>
            <CopyField label="Endpoint" value={newKey.endpoint} />
            <CopyField label="API key (send as Authorization: Bearer … or X-CRM-Key)" value={newKey.apiKey} />
            <CopyField label="HMAC secret (X-CRM-Signature)" value={newKey.hmacSecret} />
            {newKey.website === 'MPF' && <p className="rounded-md bg-blue-50 p-3 text-xs text-blue-900">MPF already supports this: set <code>CRM_WEBHOOK_URL</code> to the endpoint and <code>MPF_CRM_WEBHOOK_KEY</code> to the API key in the MPF backend environment.</p>}
            <DialogFooter><Button onClick={() => setNewKey(null)}>I&apos;ve saved them</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
