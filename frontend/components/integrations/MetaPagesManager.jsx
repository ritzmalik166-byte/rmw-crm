'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Search, Instagram, AlertTriangle } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/controls';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Every Facebook Page the connected Meta account manages (one login, all Pages). Switch a Page on to receive its
 * leads, and choose the pipeline / team per Page (empty = connection default).
 */
export function MetaPagesManager({ open, onOpenChange }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);
  const pages = useQuery({ queryKey: ['meta', 'pages'], queryFn: () => api('/manage/integrations/meta/pages'), enabled: open, retry: false });
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/manage/websites'), enabled: open, staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/manage/teams'), enabled: open, staleTime: 60_000 });

  const refresh = useMutation({
    mutationFn: () => api('/manage/integrations/meta/pages/refresh', { method: 'POST' }),
    onSuccess: (r) => { toast.success(`${r.total} Page${r.total === 1 ? '' : 's'} found, ${r.active} active`); qc.invalidateQueries({ queryKey: ['meta'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, body }) => api(`/manage/integrations/meta/pages/${id}`, { method: 'PATCH', body }),
    onMutate: ({ id }) => setBusy(id),
    onSuccess: (r, { body }) => {
      if (body.active === true) toast.success(`Page switched on${r.formsCount != null ? `: ${r.formsCount} lead form${r.formsCount === 1 ? '' : 's'} detected` : ''}`);
      else if (body.active === false) toast.success('Page switched off. Its existing leads stay in the CRM.');
      else toast.success('Saved');
      qc.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: (e) => toast.error(apiMessage(e)),
    onSettled: () => setBusy(null),
  });

  const d = pages.data;
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (d?.pages || []).filter((p) => !s || p.name?.toLowerCase().includes(s) || p.businessName?.toLowerCase().includes(s));
  }, [d, search]);
  const activeCount = (d?.pages || []).filter((p) => p.active).length;
  const defaultSite = websites.data?.find((w) => w.id === d?.defaults?.websiteId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Facebook Pages</DialogTitle>
          <DialogDescription>
            Every Page this Meta account manages. Switch on the Pages whose leads should come into the CRM. You don&apos;t need to reconnect Meta for each Page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-8 lg:pl-8" placeholder="Search Pages" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <span className="text-[13px] text-slate-600">{activeCount} of {d?.pages?.length ?? 0} active</span>
          <Button variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate()} title="Fetch Pages again from Meta (e.g. after you were given access to a new Page)">
            <RefreshCw />Refresh Pages
          </Button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {pages.isLoading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)
            : pages.isError ? <ErrorState error={pages.error} onRetry={pages.refetch} />
              : !list.length ? (
                <EmptyState title={d?.pages?.length ? 'No Page matches your search' : 'No Pages found'}
                  description={d?.pages?.length ? null : 'The connected Facebook account needs a role on the Page. Click "Refresh Pages" after access is granted.'} />
              ) : list.map((p) => {
                const siteId = p.website?.id ? String(p.website.id) : '';
                const effectiveSite = siteId || (d.defaults?.websiteId ? String(d.defaults.websiteId) : '');
                const siteTeams = (teams.data || []).filter((t) => t.is_active !== 0 && (!effectiveSite || !t.website_id || String(t.website_id) === effectiveSite));
                const saving = busy === p.id && update.isPending;
                return (
                  <div key={p.id} className={`rounded-lg border p-3 ${p.active ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-[14px] font-medium text-slate-900">{p.name}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-slate-500">
                          {p.category && <span>{p.category}</span>}
                          {p.businessName && <span>· {p.businessName}</span>}
                          {p.instagram && <span className="flex items-center gap-0.5">· <Instagram className="h-3 w-3" />@{p.instagram.username || p.instagram.id}</span>}
                        </p>
                        {p.active && (
                          <p className="mt-0.5 text-[12px] text-slate-600">
                            {p.formsCount} form{p.formsCount === 1 ? '' : 's'} · {p.leadsCount} lead{p.leadsCount === 1 ? '' : 's'}
                            {p.lastLeadAt ? ` · last ${timeAgo(p.lastLeadAt)}` : ''}
                            {!p.webhookSubscribed && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700"><AlertTriangle className="h-3 w-3" />webhook not subscribed</span>}
                          </p>
                        )}
                        {!p.hasToken && <p className="text-[12px] text-amber-700">No access to this Page. Ask for a role on it, then click Refresh Pages.</p>}
                      </div>
                      <Switch checked={p.active} disabled={saving || (!p.hasToken && !p.active)} aria-label={`Receive leads from ${p.name}`}
                        onCheckedChange={(v) => update.mutate({ id: p.id, body: { active: v } })} />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Select value={siteId} disabled={saving} aria-label="Pipeline"
                        onChange={(e) => update.mutate({ id: p.id, body: { websiteId: e.target.value ? Number(e.target.value) : null } })}>
                        <option value="">Pipeline: default{defaultSite ? ` (${defaultSite.code})` : ''}</option>
                        {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                      </Select>
                      <Select value={p.assignmentTeam?.id ? String(p.assignmentTeam.id) : ''} disabled={saving} aria-label="Team"
                        onChange={(e) => update.mutate({ id: p.id, body: { assignmentTeamId: e.target.value ? Number(e.target.value) : null } })}>
                        <option value="">Team: default</option>
                        {siteTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </div>
                  </div>
                );
              })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
