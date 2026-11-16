'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Settings2, RefreshCw } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo, toQuery, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HealthCheck, IntegrationStatus } from './IntegrationStatus';

const EVENT_TONE = { PROCESSED: 'success', DUPLICATE: 'secondary', FAILED: 'danger', IGNORED: 'warning', RECEIVED: 'info', PROCESSING: 'info' };
const LOG_TONE = { info: 'text-slate-600', warn: 'text-amber-700', error: 'text-red-700' };

function Kv({ label, children }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-[13px]">
      <dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words text-slate-800">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function RoutingForm({ status }) {
  const qc = useQueryClient();
  const c = status.connection;
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), staleTime: 60_000 });
  const [websiteId, setWebsiteId] = useState(c.website?.id ? String(c.website.id) : '');
  const [teamId, setTeamId] = useState(c.assignmentTeam?.id ? String(c.assignmentTeam.id) : '');
  const save = useMutation({
    mutationFn: () => api('/super-admin/integrations/meta/settings', { method: 'PATCH', body: { websiteId: Number(websiteId), assignmentTeamId: teamId ? Number(teamId) : null } }),
    onSuccess: () => { toast.success('Lead routing saved'); qc.invalidateQueries({ queryKey: ['meta'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CRM website (pipeline)" hint="New Meta leads are created in this website's pipeline.">
          <Select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>
            {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </Select>
        </Field>
        <Field label="Assign to team" hint="Round robin by fewest open leads. System default follows Admin > Settings.">
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">System default</option>
            {(teams.data || []).filter((t) => t.is_active !== 0 && (!t.website_id || String(t.website_id) === websiteId)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end"><Button loading={save.isPending} disabled={!websiteId} onClick={() => save.mutate()}>Save routing</Button></div>
    </div>
  );
}

function Deliveries({ canManage }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ status: '', page: 1 });
  const events = useQuery({ queryKey: ['meta', 'events', f], queryFn: () => api(`/admin/integrations/meta/events${toQuery({ ...f, limit: 15 })}`), placeholderData: keepPreviousData });
  const retry = useMutation({
    mutationFn: (id) => api(`/super-admin/integrations/meta/events/${id}/retry`, { method: 'POST' }),
    onSuccess: () => { toast.success('Retry queued'); qc.invalidateQueries({ queryKey: ['meta'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex justify-end border-b bg-slate-50/70 p-2">
        <Select className="h-8 w-40" value={f.status} onChange={(e) => setF({ status: e.target.value, page: 1 })} aria-label="Status">
          <option value="">All statuses</option>{Object.keys(EVENT_TONE).map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      {events.isLoading ? <TableSkeleton cols={5} /> : !events.data?.rows?.length ? <EmptyState title="No Meta leads received yet" description="Leads appear here as Meta delivers them." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Meta lead</TableHead><TableHead>Via</TableHead><TableHead>Status</TableHead><TableHead>CRM lead</TableHead><TableHead>Received</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {events.data.rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs">{e.leadgen_id}</TableCell>
                <TableCell className="text-xs">{e.source.toLowerCase()}</TableCell>
                <TableCell><Badge variant={EVENT_TONE[e.status]} title={e.error || ''}>{e.status.toLowerCase()}</Badge></TableCell>
                <TableCell>{e.lead_id ? <a className="hover:underline" href={`/crm/leads/${e.lead_id}`}>#{e.lead_id}</a> : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-xs">{formatDateTime(e.created_at)}</TableCell>
                <TableCell>{canManage && ['FAILED', 'IGNORED'].includes(e.status) && <Button size="sm" variant="outline" loading={retry.isPending && retry.variables === e.id} onClick={() => retry.mutate(e.id)}><RotateCcw />Retry</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pagination meta={events.data?.meta} onPage={(page) => setF({ ...f, page })} />
    </div>
  );
}

function ActivityLog() {
  const logs = useQuery({ queryKey: ['meta', 'logs'], queryFn: () => api('/admin/integrations/meta/logs?limit=100'), refetchInterval: 15_000 });
  if (logs.isLoading) return <TableSkeleton rows={6} cols={3} />;
  if (!logs.data?.length) return <EmptyState title="No activity yet" />;
  return (
    <ol className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border">
      {logs.data.map((l) => (
        <li key={l.id} className="flex gap-3 px-3 py-2 text-[12.5px]">
          <time className="w-24 shrink-0 text-slate-400" title={formatDateTime(l.created_at)}>{timeAgo(l.created_at)}</time>
          <span className={cn('min-w-0 flex-1', LOG_TONE[l.level])}>{l.message}</span>
        </li>
      ))}
    </ol>
  );
}

/** "Manage" dialog: health, lead routing, deliveries and the integration log. */
export function MetaConnectionModal({ open, onOpenChange, status, canManage, onChangeAssets }) {
  const c = status?.connection;
  const h = status?.health;
  if (!status) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">Meta Lead Ads <IntegrationStatus state={status.state} /></DialogTitle>
          <DialogDescription>{c?.metaUserName ? `Connected as ${c.metaUserName}${c.connectedBy ? ` by ${c.connectedBy}` : ''} · ${formatDateTime(c.connectedAt)}` : 'Not connected'}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="health">
          <TabsList>
            <TabsTrigger value="health">Health</TabsTrigger>
            {canManage && c && <TabsTrigger value="routing">Lead routing</TabsTrigger>}
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="log">Activity log</TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            {status.error && <p className="mb-3 rounded-md bg-red-50 p-2.5 text-xs text-red-700">{status.error.message}</p>}
            <div className="grid gap-x-8 sm:grid-cols-2">
              <dl className="divide-y divide-slate-100">
                <Kv label="Business">{c?.business?.name}</Kv>
                <Kv label="Facebook Page">{c?.page?.name}</Kv>
                <Kv label="Instagram">{c?.instagram?.name}</Kv>
                <Kv label="Ad account">{c?.adAccount?.name}</Kv>
                <Kv label="Lead forms">{c ? String(c.formsCount) : null}</Kv>
                <Kv label="CRM pipeline">{c?.website ? `${c.website.code} · ${c.website.name}` : <span className="text-amber-700">Not set</span>}</Kv>
                <Kv label="Assignment">{c?.assignmentTeam?.name || 'System default'}</Kv>
              </dl>
              <div className="divide-y divide-slate-100">
                <HealthCheck label="Webhook" ok={c ? h.webhook.subscribed && status.webhookConfigured : null} okText="Active" badText={!status.webhookConfigured ? 'Verify token not set' : 'Page not subscribed'} />
                <HealthCheck label="API" ok={h?.api.ok} okText="Connected" badText="Unreachable" hint={h?.api.error} />
                <HealthCheck label="Token" ok={h?.token.valid} okText={h?.token.expiresAt ? `Valid · expires ${formatDateTime(h.token.expiresAt)}` : 'Valid'} badText="Expired or revoked" />
                <HealthCheck label="Permissions" ok={h ? !h.token.missingScopes.length : null} okText="All granted" badText={`Missing: ${h?.token.missingScopes.join(', ')}`} />
                <Kv label="Last webhook">{h?.webhook.lastReceivedAt ? timeAgo(h.webhook.lastReceivedAt) : 'Never'}</Kv>
                <Kv label="Last Meta lead">{h?.lastLeadAt ? timeAgo(h.lastLeadAt) : 'Never'}</Kv>
                <Kv label="Leads (24h / all)">{h ? `${h.leads.last24h} / ${h.leads.total}` : null}</Kv>
                <Kv label="Failed deliveries">{h ? <span className={h.events.failed ? 'text-red-700' : ''}>{h.events.failed}</span> : null}</Kv>
              </div>
            </div>
            {canManage && c && (
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
                <Button variant="outline" onClick={onChangeAssets}><Settings2 />Change Page / ad account</Button>
              </div>
            )}
          </TabsContent>

          {canManage && c && <TabsContent value="routing"><RoutingForm status={status} /></TabsContent>}
          <TabsContent value="deliveries"><Deliveries canManage={canManage} /></TabsContent>
          <TabsContent value="log"><ActivityLog /></TabsContent>
        </Tabs>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><RefreshCw className="h-3 w-3" />Graph API {status.apiVersion}. Tokens are stored encrypted on the server and never sent to the browser.</p>
      </DialogContent>
    </Dialog>
  );
}
