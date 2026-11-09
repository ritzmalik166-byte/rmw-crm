'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Users2, Trophy, Percent, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, toQuery } from '@/lib/utils';
import { Input, Select } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { ErrorState, PageHeader, Skeleton, StatCard, EmptyState } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { WEBSITE_COLORS } from './common';

const iso = (d) => d.toISOString().slice(0, 10);
const pct = (c, t) => (Number(t) ? `${((Number(c) / Number(t)) * 100).toFixed(1)}%` : '—');

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDate(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-700">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.dataKey}<span className="ml-auto pl-3 font-medium tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function RankTable({ title, rows, label, empty }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {!rows?.length ? <EmptyState title={empty} /> : (
        <Table>
          <TableHeader><TableRow><TableHead>{label}</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Converted</TableHead><TableHead className="text-right">Rate</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                <TableCell className="text-right tabular-nums">{r.converted ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{pct(r.converted, r.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function AnalyticsView({ title = 'Analytics' }) {
  const [range, setRange] = useState(() => ({ from: iso(new Date(Date.now() - 29 * 86400_000)), to: iso(new Date()) }));
  const [websiteId, setWebsiteId] = useState('');
  const { data: websites } = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites') });
  const q = { websiteId, from: range.from, to: `${range.to}T23:59:59` };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'analytics', q], queryFn: () => api(`/admin/analytics${toQuery(q)}`) });

  const daily = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.byDay.forEach((r) => {
      const day = String(r.day).slice(0, 10);
      if (!map.has(day)) map.set(day, { day });
      map.get(day)[r.code] = Number(r.total);
    });
    return [...map.values()];
  }, [data]);
  const sites = (websites || []).filter((w) => !websiteId || String(w.id) === websiteId).map((w) => w.code);
  const maxStatus = Math.max(1, ...(data?.byStatus || []).map((s) => Number(s.total)));

  return (
    <>
      <PageHeader title={title} description="Lead volume, conversion and attribution across websites." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" />
        <span className="text-sm text-muted-foreground">to</span>
        <Input type="date" className="w-40" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" />
        <Select className="w-40" value={websiteId} onChange={(e) => setWebsiteId(e.target.value)} aria-label="Website">
          <option value="">All websites</option>{websites?.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
        </Select>
      </div>

      {isLoading ? <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div> : isError ? <Card><ErrorState error={error} onRetry={refetch} /></Card> : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total leads" value={data.totals.total.toLocaleString('en-IN')} icon={Users2} />
            <StatCard label="Converted" value={data.totals.converted.toLocaleString('en-IN')} icon={Trophy} tone="success" />
            <StatCard label="Conversion rate" value={`${data.totals.conversionRate}%`} icon={Percent} />
            <StatCard label="Unassigned" value={data.totals.unassigned.toLocaleString('en-IN')} icon={UserX} tone={data.totals.unassigned ? 'warning' : undefined} />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Leads per day by website</CardTitle></CardHeader>
              <CardContent>
                {!daily.length ? <EmptyState title="No leads in this period" /> : (
                  <div className="h-72" role="img" aria-label="Stacked bar chart of daily leads per website">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="day" tickFormatter={(d) => formatDate(d).slice(0, 6)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                        {sites.map((code, i) => (
                          <Bar key={code} dataKey={code} stackId="w" fill={WEBSITE_COLORS[code] || '#64748b'} stroke="#fff" strokeWidth={1} radius={i === sites.length - 1 ? [4, 4, 0, 0] : 0} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Leads by status</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {data.byStatus.map((s) => (
                  <div key={s.code}>
                    <div className="mb-1 flex items-center justify-between text-sm"><StatusBadge name={s.name} color={s.color} /><span className="tabular-nums text-muted-foreground">{s.total}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(Number(s.total) / maxStatus) * 100}%` }} /></div>
                  </div>
                ))}
                {!data.byStatus.length && <p className="text-sm text-muted-foreground">No data</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <RankTable title="Website performance" label="Website" rows={data.byWebsite.map((w) => ({ name: `${w.code} · ${w.name}`, total: w.total, converted: w.converted }))} empty="No leads" />
            <RankTable title="Source performance" label="Source / medium" rows={data.bySource.map((s) => ({ name: s.medium && s.medium !== 'none' ? `${s.source} / ${s.medium}` : s.source, total: s.total, converted: s.converted }))} empty="No sources" />
            <RankTable title="Campaign performance" label="Campaign" rows={data.byCampaign.map((c) => ({ name: c.campaign, total: c.total, converted: c.converted }))} empty="No campaign-tagged leads" />
          </div>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>User performance</CardTitle></CardHeader>
            {!data.byUser.length ? <EmptyState title="No assigned leads in this period" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Open</TableHead><TableHead className="text-right">Converted</TableHead><TableHead className="text-right">Rate</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.byUser.map((u) => (
                    <TableRow key={u.id}><TableCell>{u.full_name}</TableCell><TableCell className="text-right tabular-nums">{u.total}</TableCell><TableCell className="text-right tabular-nums">{u.open_leads}</TableCell><TableCell className="text-right tabular-nums">{u.converted}</TableCell><TableCell className="text-right tabular-nums text-muted-foreground">{pct(u.converted, u.total)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
