'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton, ErrorState } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Choose Business / Page / Instagram / Ad account + CRM website and team. Tokens never reach the browser. */
export function MetaAssetSelector({ open, onOpenChange }) {
  const qc = useQueryClient();
  const assets = useQuery({ queryKey: ['meta', 'assets'], queryFn: () => api('/manage/integrations/meta/assets'), enabled: open, staleTime: 60_000, retry: false });
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/manage/websites'), enabled: open, staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/manage/teams'), enabled: open, staleTime: 60_000 });
  const [f, setF] = useState(null);

  useEffect(() => {
    if (!assets.data || f) return;
    const s = assets.data.selected || {};
    const mpf = websites.data?.find((w) => w.code === 'MPF');
    setF({
      businessId: s.businessId || '', pageId: s.pageId || '', instagramId: s.instagramId || '', adAccountId: s.adAccountId || '',
      websiteId: s.websiteId ? String(s.websiteId) : mpf ? String(mpf.id) : '', assignmentTeamId: s.assignmentTeamId ? String(s.assignmentTeamId) : '',
    });
  }, [assets.data, websites.data, f]);

  const d = assets.data;
  const pages = useMemo(() => (d?.pages || []).filter((p) => !f?.businessId || !p.businessId || p.businessId === f.businessId), [d, f?.businessId]);
  const adAccounts = useMemo(() => (d?.adAccounts || []).filter((a) => !f?.businessId || !a.businessId || a.businessId === f.businessId), [d, f?.businessId]);
  const page = d?.pages?.find((p) => p.id === f?.pageId);
  const siteTeams = (teams.data || []).filter((t) => t.is_active !== 0 && (!f?.websiteId || !t.website_id || String(t.website_id) === f.websiteId));

  const forms = useQuery({
    queryKey: ['meta', 'forms', f?.pageId],
    queryFn: () => api(`/manage/integrations/meta/assets/forms${toQuery({ pageId: f.pageId })}`),
    enabled: open && Boolean(f?.pageId), retry: false, staleTime: 60_000,
  });

  const set = (k) => (e) => setF((s) => {
    const next = { ...s, [k]: e.target.value };
    if (k === 'pageId') next.instagramId = d?.pages?.find((p) => p.id === e.target.value)?.instagram?.id || '';
    if (k === 'businessId') { next.pageId = ''; next.instagramId = ''; next.adAccountId = ''; }
    return next;
  });

  const save = useMutation({
    mutationFn: () => api('/manage/integrations/meta/selection', {
      method: 'PUT',
      body: {
        pageId: f.pageId, businessId: f.businessId || null, instagramId: f.instagramId || null, adAccountId: f.adAccountId || null,
        websiteId: Number(f.websiteId), assignmentTeamId: f.assignmentTeamId ? Number(f.assignmentTeamId) : null,
      },
    }),
    onSuccess: (r) => {
      toast.success(`Meta connected. ${r?.formsCount ?? 0} lead form${r?.formsCount === 1 ? '' : 's'} detected; new leads now arrive automatically.`);
      qc.invalidateQueries({ queryKey: ['meta'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Meta connection</DialogTitle>
          <DialogDescription>Choose where Meta leads come from and which CRM pipeline they go to.</DialogDescription>
        </DialogHeader>

        {assets.isLoading || !f ? (
          assets.isError ? <ErrorState error={assets.error} onRetry={assets.refetch} /> : <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.warnings?.length > 0 && (
              <p className="flex gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 sm:col-span-2"><AlertTriangle className="h-4 w-4 shrink-0" />{d.warnings.join(' ')}</p>
            )}
            <Field label="Business">
              <Select value={f.businessId} onChange={set('businessId')}>
                <option value="">{d.businesses.length ? 'All businesses' : 'No business access'}</option>
                {d.businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Facebook Page" error={!pages.length ? 'No Pages found. The account needs a role on the Page.' : null}>
              <Select value={f.pageId} onChange={set('pageId')}>
                <option value="">Select a Page</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Instagram" hint={page && !page.instagram ? 'No Instagram account is linked to this Page.' : 'Instagram lead ads arrive through the linked Page.'}>
              <Select value={f.instagramId} onChange={set('instagramId')} disabled={!page?.instagram}>
                <option value="">None</option>
                {page?.instagram && <option value={page.instagram.id}>@{page.instagram.username || page.instagram.id}</option>}
              </Select>
            </Field>
            <Field label="Ad account" hint="Needed for campaign spend and cost per lead.">
              <Select value={f.adAccountId} onChange={set('adAccountId')}>
                <option value="">None</option>
                {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` (${a.currency})` : ''}</option>)}
              </Select>
            </Field>
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2 text-[13px] text-slate-700 sm:col-span-2">
              <FileText className="h-4 w-4 text-slate-400" />
              {!f.pageId ? 'Select a Page to detect lead forms.'
                : forms.isLoading ? <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Detecting lead forms…</span>
                  : forms.isError ? <span className="text-red-700">{apiMessage(forms.error)}</span>
                    : <span><b>{forms.data.length}</b> lead form{forms.data.length === 1 ? '' : 's'} detected{forms.data.length ? `: ${forms.data.slice(0, 3).map((x) => x.name).join(', ')}${forms.data.length > 3 ? '…' : ''}` : ''}</span>}
            </div>
            <Field label="CRM website (pipeline)">
              <Select value={f.websiteId} onChange={set('websiteId')}>
                <option value="">Select website</option>
                {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </Select>
            </Field>
            <Field label="Assign to team" hint="Round robin inside the team. Empty = system auto-assign setting.">
              <Select value={f.assignmentTeamId} onChange={set('assignmentTeamId')}>
                <option value="">System default</option>
                {siteTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!f?.pageId || !f?.websiteId} onClick={() => save.mutate()}>Save connection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
