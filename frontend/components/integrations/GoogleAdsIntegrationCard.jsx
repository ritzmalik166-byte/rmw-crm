'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, KeyRound, Megaphone, PlugZap, RotateCcw, Settings2, Unplug } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HealthCheck, IntegrationStatus } from './IntegrationStatus';

const STATUS_KEY = ['google-ads', 'status'];

export function GoogleAdsLogo() {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white text-[#4285F4]"><Megaphone className="h-5 w-5" /></span>;
}

function Row({ label, children }) {
  return <div className="flex justify-between gap-3 text-[13px]"><span className="text-slate-500">{label}</span><span className="min-w-0 truncate text-right text-slate-800">{children}</span></div>;
}

function CopyField({ label, value, secret }) {
  const [show, setShow] = useState(!secret);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); } catch { toast.error('Copy failed; select and copy manually'); }
  };
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input readOnly value={show ? value : '•'.repeat(24)} className="h-9 min-w-0 flex-1 rounded-md border bg-slate-50 px-2.5 font-mono text-[12px] text-slate-800" onFocus={(e) => e.target.select()} />
        {secret && <Button type="button" variant="outline" size="icon" onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Show'}>{show ? <EyeOff /> : <Eye />}</Button>}
        <Button type="button" variant="outline" size="icon" onClick={copy} title="Copy"><Copy /></Button>
      </div>
    </Field>
  );
}

/** Choose the target pipeline/team; saving activates the integration and creates the webhook key. */
function SettingsDialog({ open, onOpenChange, status }) {
  const qc = useQueryClient();
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), enabled: open, staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), enabled: open, staleTime: 60_000 });
  const [f, setF] = useState({ websiteId: '', assignmentTeamId: '' });

  useEffect(() => {
    if (!open) return;
    const fallback = websites.data?.find((w) => w.code === 'MPF')?.id || '';
    setF({ websiteId: String(status?.website?.id || fallback || ''), assignmentTeamId: String(status?.assignmentTeamId || '') });
  }, [open, status, websites.data]);

  const siteTeams = (teams.data || []).filter((t) => t.is_active !== 0 && (!f.websiteId || !t.website_id || String(t.website_id) === f.websiteId));
  const save = useMutation({
    mutationFn: () => api('/super-admin/integrations/google-ads/settings', { method: 'PUT', body: { websiteId: Number(f.websiteId), assignmentTeamId: f.assignmentTeamId ? Number(f.assignmentTeamId) : null } }),
    onSuccess: (r) => { qc.setQueryData(STATUS_KEY, r); toast.success('Google Ads connected. Copy the webhook URL and key into your lead forms.'); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Google Ads lead routing</DialogTitle>
          <DialogDescription>Where leads from Google Ads lead forms go in the CRM.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="CRM website (pipeline)">
            <Select value={f.websiteId} onChange={(e) => setF({ ...f, websiteId: e.target.value, assignmentTeamId: '' })}>
              <option value="">Select website</option>
              {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </Select>
          </Field>
          <Field label="Assign to team" hint="Round robin inside the team. Empty = system auto-assign setting.">
            <Select value={f.assignmentTeamId} onChange={(e) => setF({ ...f, assignmentTeamId: e.target.value })}>
              <option value="">System default</option>
              {siteTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!f.websiteId} onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EVENT_TONE = { PROCESSED: 'text-emerald-700', DUPLICATE: 'text-slate-500', FAILED: 'text-red-700', IGNORED: 'text-amber-700', RECEIVED: 'text-slate-600' };

/** Webhook details, recent deliveries and key rotation. */
function DetailsDialog({ open, onOpenChange, status, canManage }) {
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ['google-ads', 'events'], queryFn: () => api('/admin/integrations/google-ads/events?limit=20'), enabled: open, refetchInterval: open ? 15_000 : false });
  const rotate = useMutation({
    mutationFn: () => api('/super-admin/integrations/google-ads/rotate-key', { method: 'POST' }),
    onSuccess: (r) => { qc.setQueryData(STATUS_KEY, r); toast.warning('New key generated. Update it in every Google Ads lead form.'); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const retry = useMutation({
    mutationFn: (id) => api(`/super-admin/integrations/google-ads/events/${id}/retry`, { method: 'POST' }),
    onSuccess: () => { toast.success('Lead imported'); qc.invalidateQueries({ queryKey: ['google-ads'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rows = events.data?.rows || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Google Ads</DialogTitle>
          <DialogDescription>In Google Ads, open each lead form → Lead delivery → Webhook integration, paste these two values and click “Send test data”.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <CopyField label="Webhook URL" value={status.webhookUrl} />
          {canManage && status.webhookKey && <CopyField label="Key" value={status.webhookKey} secret />}
          {canManage && status.hasKey && (
            <p className="flex items-center justify-between gap-2 text-[12px] text-slate-500">
              <span>Key created {status.keyRotatedAt ? timeAgo(status.keyRotatedAt) : '—'}.</span>
              <Button variant="ghost" size="sm" loading={rotate.isPending} onClick={() => { if (window.confirm('Generate a new key? Every Google Ads lead form must be updated or its leads will be rejected.')) rotate.mutate(); }}><KeyRound />Rotate key</Button>
            </p>
          )}
          <div>
            <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-slate-600">Recent deliveries</p>
            <div className="max-h-72 overflow-auto rounded-md border">
              {events.isLoading ? <Skeleton className="m-2 h-16" /> : !rows.length ? (
                <p className="p-3 text-[13px] text-slate-500">Nothing received yet. Use “Send test data” in the Google Ads lead form.</p>
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-2 py-1.5">When</th><th className="px-2 py-1.5">Status</th><th className="px-2 py-1.5">Campaign</th><th className="px-2 py-1.5">Lead</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="whitespace-nowrap px-2 py-1.5" title={formatDateTime(r.created_at)}>{timeAgo(r.created_at)}{r.is_test ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">TEST</span> : null}</td>
                        <td className={`px-2 py-1.5 font-medium ${EVENT_TONE[r.status] || ''}`}>{r.status}{r.error && <p className="max-w-[16rem] truncate font-normal text-red-600" title={r.error}>{r.error}</p>}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.campaign_id || '—'}</td>
                        <td className="px-2 py-1.5">{r.lead_id ? <a className="text-blue-700 hover:underline" href={`/crm/leads/${r.lead_id}`}>#{r.lead_id}</a> : '—'}</td>
                        <td className="px-2 py-1.5 text-right">{canManage && ['FAILED', 'IGNORED'].includes(r.status) && <Button size="sm" variant="outline" loading={retry.isPending && retry.variables === r.id} onClick={() => retry.mutate(r.id)}><RotateCcw />Retry</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Google Ads card on the Integrations page. */
export function GoogleAdsIntegrationCard({ canManage }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(null); // 'settings' | 'details' | 'disconnect'
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: () => api('/admin/integrations/google-ads/status'), refetchInterval: 60_000 });
  const disconnect = useMutation({
    mutationFn: () => api('/super-admin/integrations/google-ads', { method: 'DELETE' }),
    onSuccess: () => { toast.success('Google Ads disconnected'); setDialog(null); qc.invalidateQueries({ queryKey: ['google-ads'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (status.isLoading) return <Card className="p-4"><Skeleton className="h-40" /></Card>;
  if (status.isError) return <Card className="p-4 text-sm text-red-700">Could not load Google Ads status: {apiMessage(status.error)}</Card>;
  const s = status.data;
  const active = s.state !== 'NOT_CONNECTED';

  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <GoogleAdsLogo />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">Google Ads</p>
            <p className="truncate text-[12px] text-slate-500">Lead form webhook</p>
          </div>
        </div>
        <IntegrationStatus state={s.state} />
      </div>

      <div className="mt-3 flex-1 space-y-1.5">
        {!active && <p className="text-[13px] text-slate-600">Receive Google Ads lead form submissions in the CRM instantly, with campaign and gclid attribution.</p>}
        {active && (
          <>
            <Row label="Pipeline">{s.website?.code || <span className="text-amber-700">Not selected</span>}</Row>
            <Row label="Last delivery">{s.lastWebhookAt ? <span title={formatDateTime(s.lastWebhookAt)}>{timeAgo(s.lastWebhookAt)}</span> : 'Never'}</Row>
            <Row label="Last lead">{s.lastLeadAt ? <span title={formatDateTime(s.lastLeadAt)}>{timeAgo(s.lastLeadAt)}</span> : 'Never'}</Row>
            {s.lastTestAt && <Row label="Last test lead">{timeAgo(s.lastTestAt)}</Row>}
            <div className="mt-2 border-t pt-1.5">
              <HealthCheck label="Webhook key" ok={s.hasKey} okText="Set" badText="Missing" />
              <HealthCheck label="Last 24h" ok={s.events.failed ? false : s.events.last24h ? true : null} okText={`${s.events.last24h} received`} badText={`${s.events.failed} failed`} unknownText="No deliveries" />
            </div>
          </>
        )}
      </div>

      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3 [&>*]:flex-1 sm:[&>*]:flex-none">
          {!active && <Button onClick={() => setDialog('settings')}><PlugZap />Connect Google</Button>}
          {active && <Button onClick={() => setDialog('details')}><KeyRound />Webhook &amp; key</Button>}
          {active && <Button variant="outline" onClick={() => setDialog('settings')}><Settings2 />Routing</Button>}
          {active && <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setDialog('disconnect')}><Unplug />Disconnect</Button>}
        </div>
      ) : active ? (
        <div className="mt-4 border-t pt-3"><Button variant="outline" size="sm" onClick={() => setDialog('details')}>View details</Button></div>
      ) : null}

      <SettingsDialog open={dialog === 'settings'} onOpenChange={(o) => setDialog(o ? 'settings' : null)} status={s} />
      {dialog === 'details' && <DetailsDialog open onOpenChange={(o) => !o && setDialog(null)} status={s} canManage={canManage} />}
      <Dialog open={dialog === 'disconnect'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Disconnect Google Ads?</DialogTitle>
            <DialogDescription>New Google Ads leads will be received but ignored (kept in the delivery log for retry). Existing leads stay in the CRM. Reconnecting keeps the same key.</DialogDescription>
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
