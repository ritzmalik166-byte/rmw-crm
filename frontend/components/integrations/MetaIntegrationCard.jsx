'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Square, RefreshCw, Settings2, Unplug, PlugZap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HealthCheck, IntegrationStatus, oauthReasonMessage } from './IntegrationStatus';
import { MetaAssetSelector } from './MetaAssetSelector';
import { MetaConnectionModal } from './MetaConnectionModal';
import { SyncProgress } from './SyncProgress';

export { MetaLogo } from './MetaLogo';
import { MetaLogo } from './MetaLogo';

function Row({ label, children }) {
  return <div className="flex justify-between gap-3 text-[13px]"><span className="text-slate-500">{label}</span><span className="min-w-0 truncate text-right text-slate-800">{children}</span></div>;
}

/** Meta card on the Integrations page: status, health summary and Connect / Manage / Sync Now / Disconnect. */
export function MetaIntegrationCard({ canManage }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // 'assets' | 'manage' | 'disconnect'
  const [syncRequested, setSyncRequested] = useState(false);
  const status = useQuery({
    queryKey: ['meta', 'status'],
    queryFn: () => api('/admin/integrations/meta/status'),
    refetchInterval: (q) => (q.state.data?.sync?.running || syncRequested ? 3_000 : 60_000),
  });
  const s = status.data;
  const c = s?.connection;

  // Return from Facebook: ?meta=connected|error&reason=...
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const result = sp.get('meta');
    if (!result) return;
    const reason = sp.get('reason');
    if (result === 'connected') {
      toast.success(reason === 'RECONNECTED' ? 'Meta reconnected.' : 'Meta authorised. Now choose the Page and ad account.');
      if (reason !== 'RECONNECTED' && canManage) setDialog('assets');
    } else {
      toast.error(oauthReasonMessage(reason));
    }
    qc.invalidateQueries({ queryKey: ['meta'] });
    sp.delete('meta'); sp.delete('reason');
    window.history.replaceState(null, '', `${window.location.pathname}${sp.toString() ? `?${sp}` : ''}`);
  }, [qc, canManage]);

  // Report the outcome once a requested sync finishes.
  useEffect(() => {
    if (!syncRequested || !s || s.sync.running) return;
    const st = s.sync.stats;
    if (s.sync.status === 'FAILED') toast.error(`Sync failed: ${st?.error || 'see the activity log'}`);
    else if (st) toast.success(`Sync complete: ${st.imported} imported, ${st.duplicatesSkipped} duplicates skipped, ${st.errors} errors`);
    setSyncRequested(false);
  }, [s, syncRequested]);

  const connect = useMutation({
    mutationFn: () => api('/super-admin/integrations/meta/connect', { method: 'POST' }),
    onSuccess: (r) => { window.location.assign(r.url); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const sync = useMutation({
    mutationFn: (full = false) => api('/super-admin/integrations/meta/sync', { method: 'POST', body: { full } }),
    onSuccess: (_r, full) => { toast.info(full ? 'Full sync started: reading the last 90 days of leads. This can take a few minutes.' : 'Sync started'); setTimeout(() => setSyncRequested(true), 1500); qc.invalidateQueries({ queryKey: ['meta', 'status'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const stop = useMutation({
    mutationFn: () => api('/super-admin/integrations/meta/sync/stop', { method: 'POST' }),
    onSuccess: () => { toast.info('Stopping sync. Leads already imported are kept.'); qc.invalidateQueries({ queryKey: ['meta', 'status'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => api('/super-admin/integrations/meta', { method: 'DELETE' }),
    onSuccess: (r) => { toast.success(r?.warnings?.length ? 'Disconnected (some Meta-side cleanup failed; see the log)' : 'Meta disconnected'); setDialog(null); qc.invalidateQueries({ queryKey: ['meta'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (status.isLoading) return <Card className="p-4"><Skeleton className="h-40" /></Card>;
  if (status.isError) return <Card className="p-4 text-sm text-red-700">Could not load Meta status: {apiMessage(status.error)}</Card>;

  const h = s.health;
  const syncing = s.sync?.running || sync.isPending;
  const st = s.sync?.stats;

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MetaLogo />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">Meta</p>
            <p className="truncate text-[12px] text-slate-500">Facebook + Instagram Lead Ads</p>
          </div>
        </div>
        <IntegrationStatus state={s.state} />
      </div>

      <div className="mt-3 flex-1 space-y-1.5">
        {s.state === 'NOT_CONFIGURED' && (
          <p className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">Server setup needed: set {s.missingConfig.join(', ')} in the API environment.</p>
        )}
        {s.state === 'NOT_CONNECTED' && <p className="text-[13px] text-slate-600">Receive Facebook and Instagram lead form submissions in the CRM instantly, with campaign attribution.</p>}
        {c && (
          <>
            <Row label="Page">{c.page?.name || <span className="text-amber-700">Not selected</span>}</Row>
            <Row label="Ad account">{c.adAccount?.name || '—'}</Row>
            <Row label="Pipeline">{c.website?.code || '—'}</Row>
            <Row label="Last webhook">{h.webhook.lastReceivedAt ? timeAgo(h.webhook.lastReceivedAt) : 'Never'}</Row>
            <Row label="Last sync">{s.sync.lastSyncAt ? <span title={formatDateTime(s.sync.lastSyncAt)}>{timeAgo(s.sync.lastSyncAt)}</span> : 'Never'}</Row>
            <div className="mt-2 border-t pt-1.5">
              <HealthCheck label="Webhook" ok={h.webhook.subscribed && s.webhookConfigured} okText="Active" badText={s.webhookConfigured ? 'Not subscribed' : 'Not configured'} />
              <HealthCheck label="API" ok={h.api.ok} okText="Connected" badText="Error" hint={h.api.error} />
              <HealthCheck label="Token" ok={h.token.valid} okText="Valid" badText="Expired" />
            </div>
            {s.sync.running && <SyncProgress stats={st} className="mt-2" />}
            {!s.sync.running && st && s.sync.lastSyncAt && (
              <p className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600">
                {s.sync.status === 'FAILED' ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                {s.sync.running ? 'Sync running…' : s.sync.status === 'FAILED' ? 'Last sync failed' : `${st.stopped ? 'Stopped · ' : ''}Imported ${st.imported} · Duplicates skipped ${st.duplicatesSkipped} · Errors ${st.errors}`}
              </p>
            )}
            {s.error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{s.error.message}</p>}
          </>
        )}
      </div>

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3 [&>*]:flex-1 sm:[&>*]:flex-none">
          {(s.state === 'NOT_CONNECTED' || s.state === 'NOT_CONFIGURED') && (
            <Button loading={connect.isPending} disabled={s.state === 'NOT_CONFIGURED'} onClick={() => connect.mutate()}><PlugZap />Connect Meta</Button>
          )}
          {!c && <Button variant="ghost" onClick={() => setDialog('manage')}>Activity log</Button>}
          {s.state === 'ERROR' && <Button loading={connect.isPending} onClick={() => connect.mutate()}><PlugZap />Reconnect</Button>}
          {s.state === 'SETUP_REQUIRED' && <Button onClick={() => setDialog('assets')}><Settings2 />Choose Page</Button>}
          {c && <Button variant="outline" onClick={() => setDialog('manage')}><Settings2 />Manage</Button>}
          {c && s.state !== 'SETUP_REQUIRED' && (syncing ? (
            <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" loading={stop.isPending} onClick={() => stop.mutate()}><Square />Stop sync</Button>
          ) : (
            <Button variant="outline" title="Read every lead Meta still keeps (last 90 days) and import any that are missing" onClick={() => sync.mutate(true)}><RefreshCw />Full sync (90 days)</Button>
          ))}
          {c && <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDialog('disconnect')}><Unplug />Disconnect</Button>}
        </div>
      ) : c ? (
        <div className="mt-4 border-t pt-3"><Button variant="outline" size="sm" onClick={() => setDialog('manage')}>View details</Button></div>
      ) : null}

      {dialog === 'assets' && <MetaAssetSelector open onOpenChange={(o) => !o && setDialog(null)} />}
      <MetaConnectionModal open={dialog === 'manage'} onOpenChange={(o) => !o && setDialog(null)} status={s} canManage={canManage} onChangeAssets={() => setDialog('assets')} />
      <Dialog open={dialog === 'disconnect'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Meta?</DialogTitle>
            <DialogDescription>New Facebook and Instagram leads stop arriving. The Page is unsubscribed, the app&apos;s access is revoked and all stored tokens are deleted. Existing leads stay in the CRM.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
