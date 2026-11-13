'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Download, Plus, Search, UserPlus, Tag, Copy, X, Phone, Mail, CalendarClock, SlidersHorizontal, RefreshCw, ArrowRightLeft, ChevronDown, Check, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced, useLookups } from '@/lib/hooks';
import { PIPELINES, PIPELINE_ORDER, PipelineLogo } from '@/lib/pipelines';
import { cn, formatDateTime, timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/controls';
import { StatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { AssignDialog, BulkStatusDialog, CreateLeadDialog } from '@/components/leads/LeadForms';

/** Status badge that doubles as a one-click status picker for users who can edit leads. */
function StatusCell({ lead, editable }) {
  const qc = useQueryClient();
  const { data: lk } = useLookups();
  const m = useMutation({
    mutationFn: (statusId) => api(`/crm/leads/${lead.id}`, { method: 'PATCH', body: { statusId } }),
    onSuccess: (_r, statusId) => { toast.success(`Status set to ${lk?.statuses?.find((s) => s.id === statusId)?.name || 'updated'}`); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['lead'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const badge = <StatusBadge name={lead.status_name} color={lead.status_color} />;
  if (!editable) return badge;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group inline-flex items-center gap-0.5 rounded disabled:opacity-60" disabled={m.isPending} aria-label={`Change status of ${lead.name || 'lead'}`}>
          {badge}<ChevronDown className="h-3 w-3 text-slate-400 group-hover:text-slate-700" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Change status</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {lk?.statuses?.filter((s) => s.is_active).map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => s.id !== lead.status_id && m.mutate(s.id)}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color || '#94a3b8' }} />
            <span className="flex-1">{s.name}</span>
            {s.id === lead.status_id && <Check className="text-[hsl(var(--primary))]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

/** wa.me needs digits with a country code; bare 10-digit numbers are Indian mobiles. */
export function whatsappHref(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? `91${d}` : d.replace(/^0+/, '')}`;
}

export function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43zm8.03-17.46A11.27 11.27 0 0 0 12.05.72C5.8.72.7 5.8.7 12.07c0 2 .52 3.95 1.52 5.67L.6 23.5l5.9-1.55a11.32 11.32 0 0 0 5.54 1.41h.01c6.26 0 11.35-5.09 11.35-11.35 0-3.03-1.18-5.88-3.32-8.02z" />
    </svg>
  );
}

/** Phone layout: one tappable card per lead with one-tap call / WhatsApp. */
function LeadCard({ lead: l, pipelineKey, editable, canTransfer, me, onTransfer, showWebsite }) {
  const wa = whatsappHref(l.phone);
  return (
    <li className="px-3 py-3 active:bg-slate-50">
      <Link href={`/crm/leads/${l.id}`} className="block">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(213_70%_94%)] text-[14px] font-semibold text-[hsl(var(--primary))]">
            {(l.name || '?').trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[15px] font-semibold text-slate-900">{l.name || 'Unnamed lead'}</p>
              {showWebsite && <WebsiteBadge code={l.website_code} />}
              <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeAgo(l.received_at || l.created_at)}</span>
            </div>
            <p className="truncate text-[12.5px] text-slate-600">{l.interest || l.form_type || l.external_lead_id}</p>
            {(l.location || l.source) && (
              <p className="truncate text-[11.5px] text-slate-400">{[l.location, l.source && `${l.source}${l.medium && l.medium !== 'none' ? ` / ${l.medium}` : ''}`].filter(Boolean).join(' · ')}</p>
            )}
            {(l.junk_reason || !!l.is_duplicate_suspect) && <div className="mt-1 flex flex-wrap items-center gap-1">
              {l.junk_reason && !(pipelineKey === 'career' && l.junk_reason === 'career') && <Badge variant="danger" className="px-1.5 py-0 text-[10px]">{JUNK_LABELS[l.junk_reason] || l.junk_reason}</Badge>}
              {!!l.is_duplicate_suspect && <Badge variant="warning" className="px-1.5 py-0 text-[10px]">Duplicate?</Badge>}
            </div>}
          </div>
        </div>
      </Link>
      <div className="mt-1.5 flex items-center gap-2 pl-[52px] [&_button]:min-h-0">
        <StatusCell lead={l} editable={editable} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">
          {l.assigned_user_name ? (l.assigned_user_id === me?.user?.id ? 'You' : l.assigned_user_name) : <span className="text-amber-700">Unassigned</span>}
        </span>
        {l.next_followup_at && <span className="text-[11px]"><FollowupCell at={l.next_followup_at} /></span>}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 pl-[52px] [&>*]:h-10 [&>*]:min-h-0">
        {l.phone
          ? <a href={`tel:${l.phone}`} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[hsl(213_70%_95%)] text-[12.5px] font-semibold text-[hsl(var(--primary))] active:scale-[0.97]"><Phone className="h-4 w-4" />Call</a>
          : <span className="flex h-9 items-center justify-center rounded-lg bg-slate-50 text-[12px] text-slate-400">No phone</span>}
        {wa
          ? <a href={wa} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 text-[12.5px] font-semibold text-emerald-700 active:scale-[0.97]"><WhatsAppIcon className="h-4 w-4" />WhatsApp</a>
          : l.email
            ? <a href={`mailto:${l.email}`} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-[12.5px] font-semibold text-slate-700 active:scale-[0.97]"><Mail className="h-4 w-4" />Email</a>
            : <span />}
        {canTransfer
          ? <button onClick={() => onTransfer(l)} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700 active:scale-[0.97]">{l.assigned_user_id ? <><ArrowRightLeft className="h-4 w-4" />Transfer</> : <><UserPlus className="h-4 w-4" />Assign</>}</button>
          : l.resume_url
            ? <a href={l.resume_url} target="_blank" rel="noopener noreferrer" className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-700"><FileText className="h-4 w-4" />Resume</a>
            : <span />}
      </div>
    </li>
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
  const [rowLead, setRowLead] = useState(null); // lead being transferred from its row
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-[17px] font-semibold text-slate-900"><PipelineLogo src={p.logo} className="h-6 w-6" />{p.title}</h1>
            <p className="hidden text-[12px] text-muted-foreground sm:block">{p.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} aria-label="Refresh"><RefreshCw className={isFetching ? 'animate-spin' : ''} /></Button>
            {can('lead.export') && <Button variant="outline" size="sm" onClick={exportCsv}><Download />Export</Button>}
            {can('lead.create') && pipelineKey !== 'career' && <Button size="sm" className="hidden lg:inline-flex" onClick={() => setDialog('create')}><Plus />Add lead</Button>}
          </div>
        </div>

        {/* Pipeline summary strip */}
        {stats && (
          <div className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-slate-200/70 sm:grid-cols-6">
            {[['Total', stats.total], ['New', stats.new_leads], ['Today', stats.today], ['Unassigned', stats.unassigned, stats.unassigned > 0 && 'text-amber-700'], ['Overdue follow-ups', stats.overdue, stats.overdue > 0 && 'text-red-700'], ['Converted', stats.converted, 'text-emerald-700']].map(([label, val, tone]) => (
              <div key={label} className="bg-white px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className={cn('text-[17px] font-semibold tabular-nums text-slate-900', tone)}>{val ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="rounded-t-xl border bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-2">
            <div className="order-2 flex max-w-full overflow-x-auto rounded-lg border bg-slate-50 p-0.5 sm:order-none [scrollbar-width:none]">
              {VIEWS.filter((v) => !v.perm || can(v.perm)).map((v) => (
                <button key={v.key} onClick={() => setFilter({ view: v.key })} className={cn('whitespace-nowrap rounded-sm px-2.5 py-1 text-[12px] font-medium', filters.view === v.key ? 'bg-white text-[hsl(var(--primary))] shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-slate-900')}>{v.label}</button>
              ))}
            </div>
            <div className="relative order-1 basis-full sm:order-none sm:min-w-[220px] sm:flex-1 sm:basis-auto">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" placeholder="Search name, phone, email, lead ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search leads" />
            </div>
            {has('status') && (
              <Select className="order-3 min-w-0 basis-[calc(50%-4px)] sm:order-none sm:w-36 sm:basis-auto" value={filters.statusId} onChange={(e) => setFilter({ statusId: e.target.value })} aria-label="Status">
                <option value="">Any status</option>{lk?.statuses?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {has('owner') && (
              <Select className="order-3 min-w-0 basis-[calc(50%-4px)] sm:order-none sm:w-40 sm:basis-auto" value={filters.assignedUserId} onChange={(e) => setFilter({ assignedUserId: e.target.value })} aria-label="Owner">
                <option value="">Any owner</option><option value="me">Me</option>
                {can('lead.view_all') && <option value="unassigned">Unassigned</option>}
                {can('lead.view_all') && lk?.users?.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            )}
            <Button className="order-4 basis-[calc(50%-4px)] sm:order-none sm:basis-auto" variant={moreFilters || activeFilters ? 'secondary' : 'outline'} size="sm" onClick={() => setMoreFilters((v) => !v)}>
              <SlidersHorizontal />Filters{activeFilters ? ` (${activeFilters})` : ''}
            </Button>
            <Select className="order-4 min-w-0 basis-[calc(50%-4px)] sm:order-none sm:w-36 sm:basis-auto" value={`${filters.sort || 'created_at'}:${filters.dir || 'desc'}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); setFilter({ sort, dir }); }} aria-label="Sort">
              <option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option>
              <option value="updated_at:desc">Recently updated</option><option value="name:asc">Name A–Z</option><option value="status:asc">By status</option>
            </Select>
          </div>

          {moreFilters && (
            <div className="grid grid-cols-2 gap-2 border-b bg-slate-50/70 px-2.5 py-2 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="overflow-hidden rounded-b-xl border border-t-0 bg-white">
          {isLoading ? <TableSkeleton cols={colCount} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : rows.length === 0 ? (
            <EmptyState title="No leads match" description={activeFilters || filters.search || filters.view ? 'Try another view or remove some filters.' : 'Leads from this source will appear here automatically.'} />
          ) : (
            <div className={isFetching ? 'opacity-70 transition-opacity' : ''}>
              <ul className="divide-y divide-slate-100 md:grid md:grid-cols-2 md:divide-y-0 md:[&>li:nth-child(odd)]:border-r md:[&>li]:border-b md:[&>li]:border-slate-100 xl:hidden">
                {rows.map((l) => (
                  <LeadCard key={l.id} lead={l} pipelineKey={pipelineKey} editable={can('lead.edit')} me={me} showWebsite={p.showWebsite}
                    canTransfer={l.assigned_user_id ? can('lead.reassign') : can('lead.assign')} onTransfer={setRowLead} />
                ))}
              </ul>
              <div className="hidden xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8"><Checkbox checked={allSelected} onCheckedChange={(v) => setSelected(v ? rows.map((r) => r.id) : [])} aria-label="Select all" /></TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    {p.showWebsite && <TableHead>Site</TableHead>}
                    <TableHead>{p.interestLabel}</TableHead>
                    {p.showResume && <TableHead>Resume</TableHead>}
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
                      {p.showResume && (
                        <TableCell className="whitespace-nowrap">
                          {l.resume_url
                            ? <a href={l.resume_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-[hsl(var(--primary))] hover:underline"><FileText className="h-3.5 w-3.5" />View</a>
                            : <span className="text-slate-400">—</span>}
                        </TableCell>
                      )}
                      {p.showSource && (
                        <TableCell className="max-w-[180px]">
                          <div className="truncate">{l.source || '—'}{l.medium && l.medium !== 'none' ? <span className="text-slate-500"> / {l.medium}</span> : ''}</div>
                          {l.campaign && <div className="truncate text-[11px] text-slate-500" title={l.campaign}>{l.campaign}</div>}
                        </TableCell>
                      )}
                      <TableCell><StatusCell lead={l} editable={can('lead.edit')} /></TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{l.assigned_user_name ? (l.assigned_user_id === me?.user?.id ? <span className="font-medium">You</span> : l.assigned_user_name) : <span className="text-amber-700">Unassigned</span>}</span>
                          {(l.assigned_user_id ? can('lead.reassign') : can('lead.assign')) && (
                            <button className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-[hsl(var(--primary))]" onClick={() => setRowLead(l)} title={l.assigned_user_id ? 'Transfer lead' : 'Assign lead'} aria-label={`${l.assigned_user_id ? 'Transfer' : 'Assign'} ${l.name || 'lead'}`}>
                              {l.assigned_user_id ? <ArrowRightLeft className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      </TableCell>
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
            </div>
          )}
          <Pagination meta={data?.meta} onPage={(page) => setFilter({ page: String(page) })} />
        </div>
      </div>

      {can('lead.create') && pipelineKey !== 'career' && (
        <button onClick={() => setDialog('create')} aria-label="Add lead"
          className="fixed bottom-[calc(max(env(safe-area-inset-bottom),14px)+80px)] right-4 md:bottom-[calc(max(env(safe-area-inset-bottom),18px)+92px)] md:right-6 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-white shadow-lg shadow-[hsl(var(--primary))]/30 active:scale-95 lg:hidden">
          <Plus className="h-6 w-6" />
        </button>
      )}
      <CreateLeadDialog open={dialog === 'create'} onOpenChange={(o) => !o && setDialog(null)} />
      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
      {rowLead && <AssignDialog open onOpenChange={(o) => !o && setRowLead(null)} leadIds={[rowLead.id]} currentOwner={rowLead.assigned_user_id ? { id: rowLead.assigned_user_id, name: rowLead.assigned_user_name } : null} leadName={rowLead.name} />}
      <BulkStatusDialog open={dialog === 'status'} onOpenChange={(o) => !o && setDialog(null)} leadIds={selected} onDone={() => setSelected([])} />
    </div>
  );
}
