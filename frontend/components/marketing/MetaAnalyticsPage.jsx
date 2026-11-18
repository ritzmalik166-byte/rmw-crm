'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { X, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { formatDate, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateRangeFilter, RANGE_PRESETS } from '@/components/ui/date-range';
import { ErrorState, PageHeader, Skeleton, EmptyState } from '@/components/ui/feedback';
import { MetaOverview } from './MetaOverview';
import { ConversionFunnel } from './ConversionFunnel';
import { CampaignPerformance } from './CampaignPerformance';

const EMPTY = { pageId: '', campaignId: '', adSetId: '', adId: '', formId: '', assignedUserId: '', statusId: '', platform: '', websiteId: '' };

function DayTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md"><p className="font-medium">{formatDate(label)}</p><p className="tabular-nums text-slate-700">{payload[0].value} leads</p></div>;
}

/** /admin/marketing/meta and /super-admin/marketing/meta: Meta Ads performance from synchronised CRM data. */
export function MetaAnalyticsPage({ integrationsHref }) {
  const [range, setRange] = useState(() => ({ preset: '30d', ...RANGE_PRESETS['30d'].get() }));
  const [f, setF] = useState(EMPTY);
  const { data: lk } = useLookups();
  const q = { from: range.from, to: range.to, ...f };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['meta', 'analytics', q], queryFn: () => api(`/admin/marketing/meta/analytics${toQuery(q)}`), placeholderData: keepPreviousData,
  });
  const pages = useQuery({ queryKey: ['meta', 'activePages'], queryFn: () => api('/admin/marketing/meta/pages'), staleTime: 60_000 });
  const set = (k) => (e) => setF((s) => {
    const next = { ...s, [k]: e.target.value };
    if (k === 'campaignId') { next.adSetId = ''; next.adId = ''; }
    if (k === 'adSetId') next.adId = '';
    return next;
  });
  const o = data?.options;
  const adSets = useMemo(() => (o?.adSets || []).filter((a) => !f.campaignId || a.campaign_id === f.campaignId), [o, f.campaignId]);
  const ads = useMemo(() => (o?.ads || []).filter((a) => !f.adSetId || a.ad_set_id === f.adSetId), [o, f.adSetId]);
  const active = Object.values(f).filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Meta Ads"
        description="Facebook + Instagram lead ads: volume, funnel and cost per lead from CRM data."
        actions={integrationsHref ? <Button variant="outline" asChild><Link href={integrationsHref}><ExternalLink />Connection</Link></Button> : null}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DateRangeFilter value={range} onChange={setRange} />
        {pages.data?.length > 1 && (
          <Select className="w-full sm:w-64" value={f.pageId} onChange={set('pageId')} aria-label="Facebook Page">
            <option value="">All Pages ({pages.data.length})</option>
            {pages.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        )}
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Select value={f.campaignId} onChange={set('campaignId')} aria-label="Campaign"><option value="">All campaigns</option>{o?.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}</Select>
        <Select value={f.adSetId} onChange={set('adSetId')} aria-label="Ad set"><option value="">All ad sets</option>{adSets.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}</Select>
        <Select value={f.adId} onChange={set('adId')} aria-label="Ad"><option value="">All ads</option>{ads.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}</Select>
        <Select value={f.formId} onChange={set('formId')} aria-label="Form"><option value="">All forms</option>{o?.forms.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}</Select>
        <Select value={f.platform} onChange={set('platform')} aria-label="Source"><option value="">Facebook + Instagram</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></Select>
        <Select value={f.assignedUserId} onChange={set('assignedUserId')} aria-label="Salesperson"><option value="">All salespeople</option><option value="unassigned">Unassigned</option>{o?.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
        <Select value={f.statusId} onChange={set('statusId')} aria-label="Status"><option value="">Any status</option>{lk?.statuses?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        {lk?.websites?.length > 1 ? (
          <Select value={f.websiteId} onChange={set('websiteId')} aria-label="Website"><option value="">All websites</option>{lk.websites.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</Select>
        ) : <span />}
        {active > 0 && <Button variant="ghost" size="sm" className="col-span-2 sm:col-span-1" onClick={() => setF(EMPTY)}><X />Clear filters ({active})</Button>}
      </div>

      {isLoading ? <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : isError ? <Card><ErrorState error={error} onRetry={refetch} /></Card> : (
          <div className={`space-y-5 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
            <MetaOverview totals={data.totals} />
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-2"><ConversionFunnel funnel={data.funnel} /></div>
              <Card className="lg:col-span-3">
                <CardHeader><CardTitle>Meta leads per day</CardTitle></CardHeader>
                <CardContent>
                  {!data.byDay.length ? <EmptyState title="No Meta leads in this period" description="Leads arrive here as soon as Meta delivers them. Connect Meta under Integrations." /> : (
                    <div className="h-64" role="img" aria-label="Bar chart of Meta leads per day">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.byDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%">
                          <CartesianGrid vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="day" tickFormatter={(d) => formatDate(d).slice(0, 6)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip content={<DayTooltip />} cursor={{ fill: '#f1f5f9' }} />
                          <Bar dataKey="total" fill="#1877F2" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <CampaignPerformance rows={data.campaigns} spendAvailable={data.spendAvailable} selectedId={f.campaignId} onSelect={(id) => setF((s) => ({ ...s, campaignId: s.campaignId === id ? '' : id, adSetId: '', adId: '' }))} />
          </div>
        )}
    </>
  );
}
