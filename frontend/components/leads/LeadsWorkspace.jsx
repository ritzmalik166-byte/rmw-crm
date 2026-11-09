'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Download, Plus, Search, UserPlus, Tag, Copy, X, Phone, Mail, CalendarClock, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced, useLookups } from '@/lib/hooks';
import { PIPELINES, PIPELINE_ORDER, PipelineLogo } from '@/lib/pipelines';
import { cn, formatDateTime, timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/controls';
import { StatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { AssignDialog, BulkStatusDialog, CreateLeadDialog } from '@/components/leads/LeadForms';

const JUNK_LABELS = { career: 'Job application', job_seeker: 'Job seeker / vendor', spam: 'Spam', test: 'Test', internal: 'Internal', repeat: 'Repeat submit', bad_phone: 'Fake phone', bad_name: 'Bad name', empty: 'Empty' };
const FILTER_KEYS = ['search', 'view', 'websiteId', 'statusId', 'source', 'campaign', 'interest', 'formType', 'assignedUserId', 'from', 'to', 'duplicates', 'junk', 'sort', 'dir', 'page'];
const VIEWS = [
  { key: '', label: 'All' },
  { key: 'mine', label: 'My leads' },
  { key: 'unassigned', label: 'Unassigned', perm: 'lead.view_all' },
  { key: 'new', label: 'New' },
  { key: 'duplicates', label: 'Possible duplicates' },
];

function PipelineTabs({ active, counts }) {
  const tabs = ['all', ...PIPELINE_ORDER];
  return (
    <div className="flex overflow-x-auto border-b bg-white">
      {tabs.map((k) => {
        const p = PIPELINES[k];
        const href = k === 'all' ? '/crm/leads' : `/crm/pipeline/${k}`;
        const c = k === 'all' ? null : counts?.[k];
        return (
          <Link key={k} href={href} className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] font-medium',
            active === k ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'border-transparent text-slate-600 hover:text-slate-900')}>
            <PipelineLogo src={p.logo} />{p.short === 'All' ? 'All leads' : `${p.short} Leads`}
            {c && <span className={cn('rounded-sm px-1.5 text-[11px] tabular-nums', active === k ? 'bg-[hsl(213_70%_94%)]' : 'bg-slate-100')}>{c.total}</span>}
            {c?.new_leads > 0 && <span className="rounded-sm bg-blue-600 px-1 text-[10px] font-semibold text-white" title="New">{c.new_leads}</span>}
          </Link>
        );
      })}
    </div>
  );
}

function FollowupCell({ at }) {
  if (!at) return <span className="text-slate-400">—</span>;
  const overdue = new Date(at) < new Date();
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', overdue ? 'font-medium text-red-700' : 'text-slate-700')} title={formatDateTime(at)}>
      <CalendarClock className="h-3.5 w-3.5" />{overdue ? `Overdue · ${timeAgo(at)}` : timeAgo(at)}
    </span>
  );
}

export function LeadsWorkspace({ pipelineKey = 'all' }) {
  const p = PIPELINES[pipelineKey];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can, me } = useAuth();
  const { data: lk } = useLookups();
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines'], queryFn: () => api('/crm/pipelines'), staleTime: 60_000 });
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params]);
  const [search, setSearch] = useState(filters.search);
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [moreFilters, setMoreFilters] = useState(false);

  const setFilter = (patch) => {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) next.page = '';
    router.replace(`${pathname}${toQuery(next)}`, { scroll: false });
    setSelected([]);
  };
  useEffect(() => {
    if (debounced !== filters.search) setFilter({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Quick views map onto existing API filters.
  const viewFilters = {
    mine: { assignedUserId: 'me' }, unassigned: { assignedUserId: 'unassigned' }, duplicates: { duplicates: 'true' },
    new: { statusId: lk?.statuses?.find((s) => s.code === 'NEW')?.id || '' },
  }[filters.view] || {};
  const { view, ...apiFilters } = filters;
  const query = { ...apiFilters, ...viewFilters, pipeline: p.apiPipeline || pipelineKey, page: filters.page || 1, limit: 50 };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['leads', query], queryFn: () => api(`/crm/leads${toQuery(query)}`), placeholderData: keepPreviousData,
  });

  const rows = data?.rows || [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const has = (f) => p.filters.includes(f);
  const activeFilters = ['websiteId', 'statusId', 'source', 'campaign', 'interest', 'formType', 'assignedUserId', 'from', 'to', 'junk'].filter((k) => filters[k]).length;
  const formTypes = (pipe?.formTypes || []).filter((f) => !p.website || f.website === p.website).filter((f) => pipelineKey !== 'rmw' || f.form_type?.toLowerCase() !== 'career');
  const stats = pipelineKey === 'all' ? null : pipe?.counts?.[pipelineKey];

  const exportCsv = async () => {
    try {
      const res = await api(`/crm/leads/export${toQuery({ ...query, page: 1, limit: 100 })}`, { raw: true });
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: `${pipelineKey}-leads-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiMessage(e)); }
  };

  const colCount = 7 + (p.showWebsite ? 1 : 0) + (p.showSource ? 1 : 0);

  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6">
      {!p.standalone && <PipelineTabs active={pipelineKey} counts={pipe?.counts} />}

      <div className={cn('px-4 sm:px-6', p.standalone ? 'pt-4' : 'pt-3')}>
        {/* Title row */}
        <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900"><PipelineLogo src={p.logo} className="h-6 w-6" />{p.title}</h1>
            <p className="text-[12px] text-muted-foreground">{p.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Refresh"><RefreshCw className={isFetching ? 'animate-spin' : ''} /></Button>
            {can('lead.export') && <Button variant="outline" size="sm" onClick={exportCsv}><Download />Export</Button>}
            {can('lead.create') && pipelineKey !== 'career' && <Button size="sm" onClick={() => setDialog('create')}><Plus />Add lead</Button>}
          </div>
        </div>

        {/* Pipeline summary strip */}
        {stats && (
          <div className="mb-3 grid grid-cols-3 divide-x rounded border bg-white sm:grid-cols-6">
            {[['Total', stats.total], ['New', stats.new_leads], ['Today', stats.today], ['Unassigned', stats.unassigned, stats.unassigned > 0 && 'text-amber-700'], ['Overdue follow-ups', stats.overdue, stats.overdue > 0 && 'text-red-700'], ['Converted', stats.converted, 'text-emerald-700']].map(([label, val, tone]) => (
              <div key={label} className="px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={cn('text-[17px] font-semibold tabular-nums text-slate-900', tone)}>{val ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="rounded-t border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-2">
            <div className="flex overflow-x-auto rounded border bg-slate-50 p-0.5">
              {VIEWS.filter((v) => !v.perm || can(v.perm)).map((v) => (
                <button key={v.key} onClick={() => setFilter({ view: v.key })} className={cn('whitespace-nowrap rounded-sm px-2.5 py-1 text-[12px] font-medium', filters.view === v.key ? 'bg-white text-[hsl(var(--primary))] shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>{v.label}</button>
              ))}
            </div>
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2 top-2 h-4 w-4 text-slate-400" />
              <Input className="pl-7" placeholder="Search name, phone, email, lead ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
            </div>
            {has('status') && (
              <Select className="w-36" value={filters.statusId} onChange={(e) => setFilter({ statusId: e.target.value })} aria-label="Status">
                <option value="">Any status</option>{lk?.statuses?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {has('owner') && (
              <Select className="w-40" value={filters.assignedUserId} onChange={(e) => setFilter({ assignedUserId: e.target.value })} aria-label="Owner">
                <option value="">Any owner</option><option value="me">Me</option>
                {can('lead.view_all') && <option value="unassigned">Unassigned</option>}
                {can('lead.view_all') && lk?.users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            )}
            <Button variant={moreFilters || activeFilters ? 'secondary' : 'outline'} size="sm" onClick={() => setMoreFilters((v) => !v)}>
              <SlidersHorizontal />Filters{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
            <Select className="w-36" value={`${filters.sort || 'created_at'}:${filters.dir || 'desc'}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); setFilter({ sort, dir }); }} aria-label="Sort">
              <option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option>
              <option value="updated_at:desc">Recently updated</option><option value="name:asc">Name A–Z</option><option value="status:asc">By status</option>
            </Select>
          </div>

          {moreFilters && (
            <div className="grid gap-2 border-b bg-slate-50/70 px-2.5 py-2 sm:grid-cols-3 lg:grid-cols-6">
              {has('website') && <Select value={filters.websiteId} onChange={(e) => setFilter({ websiteId: e.target.value })} aria-label="Website"><option value="">All websites</option>{lk?.websites?.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</Select>}
              {has('source') && <Select value={filters.source} onChange={(e) => setFilter({ source: e.target.value })} aria-label="Source"><option value="">Any source</option>{lk?.sources?.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select>}
              {has('campaign') && <Input value={filters.campaign} onChange={(e) => setFilter({ campaign: e.target.value })} placeholder="Campaign" aria-label="Campaign" />}
              {has('interest') && <Input value={filters.interest} onChange={(e) => setFilter({ interest: e.target.value })} placeholder={p.interestPlaceholder} aria-label={p.interestLabel} />}
              {has('formType') && formTypes.length > 0 && (
                <Select value={filters.formType} onChange={(e) => setFilter({ formType: e.target.value })} aria-label="Form">
                  <option value="">{`Any ${(p.formTypeLabel || 'form').toLowerCase()}`}</option>
                  {[...new Set(formTypes.map((f) => f.form_type))].map((f) => <option key={f} value={f}>{f}</option>)}
                </Select>
              )}
              {has('dates') && <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} aria-label="Received from" title="Received from" />}
              {has('dates') && <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} aria-label="Received to" title="Received to" />}
              {has('quality') && <Select value={filters.junk} onChange={(e) => setFilter({ junk: e.target.value })} aria-label="Lead quality"><option value="">Genuine leads</option><option value="only">Junk / spam only</option><option value="all">Include junk</option></Select>}
              {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); router.replace(pathname); }}><X />Clear all</Button>}
            </div>
          )}

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-[hsl(213_70%_96%)] px-2.5 py-1.5 text-[12px]">
              <span className="font-semibold text-[hsl(var(--primary))]">{selected.length} selected</span>
              {(can('lead.assign') || can('lead.reassign')) && <Button size="sm" variant="outline" onClick={() => setDialog('assign')}><UserPlus />Assign owner</Button>}
              {can('lead.edit') && <Button size="sm" variant="outline" onClick={() => setDialog('status')}><Tag />Change status</Button>}
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="rounded-b border border-t-0 bg-white">
          {isLoading ? <TableSkeleton cols={colCount} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : rows.length === 0 ? (
            <EmptyState title="No leads match" description={activeFilters || filters.search || filters.view ? 'Try another view or remove some filters.' : 'Leads from this source will appear here automatically.'} />
          ) : (
            <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} aria-label="Select all" /></TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    {p.showWebsite && <TableHead>Site</TableHead>}
                    <TableHead>{p.interestLabel}</TableHead>
                    {p.showSource && <TableHead>Source / campaign</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Next follow-up</TableHead>
                    <TableHead>Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => (
                    <TableRow key={l.id} data-state={selected.includes(l.id) ? 'selected' : undefined}>
                      <TableCell><Checkbox checked={selected.includes(l.id)} onCheckedChange={() => toggle(l.id)} aria-label={`Select ${l.name}`} /></TableCell>
                      <TableCell className="min-w-[180px]">
                        <Link href={`/crm/leads/${l.id}`} className="font-semibold text-[hsl(var(--primary))] hover:underline">{l.name || 'Unnamed lead'}</Link>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                          <span className="font-mono">{l.external_lead_id}</span>
                          {l.form_type && pipelineKey !== 'career' && <span>· {l.form_type}</span>}
                          {l.junk_reason && !(pipelineKey === 'career' && l.junk_reason === 'career') && <Badge variant="danger" className="px-1 py-0 text-[10px]">{JUNK_LABELS[l.junk_reason] || l.junk_reason}</Badge>}
                          {!!l.is_duplicate_suspect && <Badge variant="warning" className="px-1 py-0 text-[10px]"><Copy className="mr-0.5 h-3 w-3" />Duplicate?</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-[12px]">
                        {l.phone && <a href={`tel:${l.phone}`} className="flex items-center gap-1 text-slate-800 hover:underline"><Phone className="h-3 w-3 text-slate-400" />{l.phone}</a>}
                        {l.email && <a href={`mailto:${l.email}`} className="flex max-w-[200px] items-center gap-1 truncate text-slate-500 hover:underline"><Mail className="h-3 w-3 shrink-0 text-slate-400" />{l.email}</a>}
                      </TableCell>
                      {p.showWebsite && <TableCell><WebsiteBadge code={l.website_code} /></TableCell>}
                      <TableCell className="max-w-[200px]">
                        <div className="truncate" title={l.interest || ''}>{l.interest || <span className="text-slate-400">—</span>}</div>
                        {l.location && <div className="truncate text-[11px] text-slate-500">{l.location}</div>}
                      </TableCell>
                      {p.showSource && (
                        <TableCell className="max-w-[180px]">
                          <div className="truncate">{l.source || '—'}{l.medium && l.medium !== 'none' ? <span className="text-slate-500"> / {l.medium}</span> : ''}</div>
                          {l.campaign && <div className="truncate text-[11px] text-slate-500" title={l.campaign}>{l.campaign}</div>}
                        </TableCell>
                      )}
                      <TableCell><StatusBadge name={l.status_name} color={l.status_color} /></TableCell>
                      <TableCell className="whitespace-nowrap">{l.assigned_user_name ? (l.assigned_user_id === me?.user?.id ? <span className="font-medium">You</span> : l.assigned_user_name) : <span className="text-amber-700">Unassigned</span>}</TableCell>
                      <TableCell><FollowupCell at={l.next_followup_at} /></TableCell>
                      <TableCell className="whitespace-nowrap" title={`Imported to CRM: ${formatDateTime(l.created_at)}`}>
                        <div>{formatDateTime(l.received_at || l.created_at)}</div>
                        <div className="text-[11px] text-slate-500">{timeAgo(l.received_at || l.created_at)}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pagination meta={data?.meta} onPage={(page) => setFilter({ page: String(page) })} />
        </div>
      </div>

      <CreateLeadDialog open={dialog === 'create'} onOpenChange={(o) => !o && setDialog(null)} />
      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
      <BulkStatusDialog open={dialog === 'status'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
    </div>
  );
}
