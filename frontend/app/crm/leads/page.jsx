'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Download, Plus, Search, UserPlus, Tag, Copy, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced, useLookups } from '@/lib/hooks';
import { formatDateTime, timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/controls';
import { StatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { AssignDialog, BulkStatusDialog, CreateLeadDialog } from '@/components/leads/LeadForms';

const JUNK_LABELS = { career: 'Job application', job_seeker: 'Job seeker / vendor', spam: 'Spam', test: 'Test', internal: 'Internal', repeat: 'Repeat submit', bad_phone: 'Fake phone', bad_name: 'Bad name', empty: 'Empty' };

const FILTER_KEYS = ['search', 'websiteId', 'statusId', 'source', 'campaign', 'assignedUserId', 'from', 'to', 'duplicates', 'junk', 'sort', 'dir', 'page'];

function LeadsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const { data: lk } = useLookups();
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params]);
  const [search, setSearch] = useState(filters.search);
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(null);

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

  const query = { ...filters, page: filters.page || 1, limit: 25 };
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['leads', query],
    queryFn: () => api(`/crm/leads${toQuery(query)}`),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows || [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const activeFilters = FILTER_KEYS.filter((k) => !['page', 'sort', 'dir', 'search'].includes(k) && filters[k]).length;

  const exportCsv = async () => {
    try {
      const res = await api(`/crm/leads/export${toQuery({ ...filters, page: 1, limit: 100 })}`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: `leads-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiMessage(e)); }
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description="All leads from MPF, RMW and CT that you have access to."
        actions={<>
          {can('lead.export') && <Button variant="outline" onClick={exportCsv}><Download />Export</Button>}
          {can('lead.create') && <Button onClick={() => setDialog('create')}><Plus />Add lead</Button>}
        </>}
      />

      <Card className="mb-4 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, email, phone, lead ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
          </div>
          <Select value={filters.websiteId} onChange={(e) => setFilter({ websiteId: e.target.value })} aria-label="Website">
            <option value="">All websites</option>
            {lk?.websites?.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
          </Select>
          <Select value={filters.statusId} onChange={(e) => setFilter({ statusId: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {lk?.statuses?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select value={filters.source} onChange={(e) => setFilter({ source: e.target.value })} aria-label="Source">
            <option value="">All sources</option>
            {lk?.sources?.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          </Select>
          <Select value={filters.assignedUserId} onChange={(e) => setFilter({ assignedUserId: e.target.value })} aria-label="Assigned to">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            {can('lead.view_all') && <option value="unassigned">Unassigned</option>}
            {can('lead.view_all') && lk?.users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </Select>
          <Input value={filters.campaign} onChange={(e) => setFilter({ campaign: e.target.value })} placeholder="Campaign" aria-label="Campaign" />
          <Input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} aria-label="To date" />
          <Select value={filters.junk} onChange={(e) => setFilter({ junk: e.target.value })} aria-label="Lead quality">
            <option value="">Real leads only</option>
            <option value="only">Junk / spam only</option>
            <option value="all">Everything</option>
          </Select>
          <label className="flex items-center gap-2 px-1 text-sm"><Checkbox checked={filters.duplicates === 'true'} onCheckedChange={(v) => setFilter({ duplicates: v ? 'true' : '' })} />Possible duplicates</label>
          <Select value={`${filters.sort || 'created_at'}:${filters.dir || 'desc'}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); setFilter({ sort, dir }); }} aria-label="Sort">
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="updated_at:desc">Recently updated</option>
            <option value="name:asc">Name A–Z</option>
            <option value="status:asc">Status</option>
          </Select>
          {activeFilters > 0 && <Button variant="ghost" onClick={() => { setSearch(''); router.replace(pathname); }}><X />Clear filters</Button>}
        </div>
      </Card>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
          <span className="font-medium">{selected.length} selected</span>
          {(can('lead.assign') || can('lead.reassign')) && <Button size="sm" variant="outline" onClick={() => setDialog('assign')}><UserPlus />Assign</Button>}
          {can('lead.edit') && <Button size="sm" variant="outline" onClick={() => setDialog('status')}><Tag />Change status</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={7} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : rows.length === 0 ? (
          <EmptyState title="No leads match" description={activeFilters || filters.search ? 'Try removing some filters.' : 'New leads from the websites will appear here automatically.'} />
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} aria-label="Select all" /></TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Interest</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => (
                  <TableRow key={l.id} data-state={selected.includes(l.id) ? 'selected' : undefined}>
                    <TableCell><Checkbox checked={selected.includes(l.id)} onCheckedChange={() => toggle(l.id)} aria-label={`Select ${l.name}`} /></TableCell>
                    <TableCell className="min-w-[200px]">
                      <Link href={`/crm/leads/${l.id}`} className="font-medium hover:underline">{l.name || 'Unnamed lead'}</Link>
                      <div className="text-xs text-muted-foreground">{[l.phone, l.email].filter(Boolean).join(' · ')}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {l.external_lead_id}
                        {l.junk_reason && <Badge variant="danger" className="px-1 py-0 text-[10px]">{JUNK_LABELS[l.junk_reason] || l.junk_reason}</Badge>}
                        {!!l.is_duplicate_suspect && <Badge variant="warning" className="px-1 py-0 text-[10px]"><Copy className="mr-0.5 h-3 w-3" />Duplicate?</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><WebsiteBadge code={l.website_code} /></TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{l.interest || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">
                      <div>{l.source || '—'}{l.medium && l.medium !== 'none' ? <span className="text-muted-foreground"> / {l.medium}</span> : ''}</div>
                      {l.campaign && <div className="max-w-[160px] truncate text-xs text-muted-foreground">{l.campaign}</div>}
                    </TableCell>
                    <TableCell><StatusBadge name={l.status_name} color={l.status_color} /></TableCell>
                    <TableCell className="text-sm">{l.assigned_user_name || <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm" title={`Imported to CRM: ${formatDateTime(l.created_at)}`}>
                      <div>{formatDateTime(l.received_at || l.created_at)}</div>
                      <div className="text-xs text-muted-foreground">{timeAgo(l.received_at || l.created_at)}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination meta={data?.meta} onPage={(page) => setFilter({ page: String(page) })} />
      </Card>

      <CreateLeadDialog open={dialog === 'create'} onOpenChange={(o) => !o && setDialog(null)} />
      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
      <BulkStatusDialog open={dialog === 'status'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
    </>
  );
}

export default function LeadsPage() {
  return <Suspense><LeadsInner /></Suspense>;
}
