'use client';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo, toQuery, cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const formLeadsHref = (formId) => `/crm/meta${toQuery({ formId })}`;

export function useMetaLeadForms(params = {}) {
  return useQuery({
    queryKey: ['meta', 'lead-forms', params],
    queryFn: () => api(`/crm/meta/forms${toQuery(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/**
 * Meta lead forms with their lead counts. `compact` = dashboard panel (name, leads in range, total).
 * Clicking a form opens the MPF pipeline filtered to that form's leads.
 */
export function MetaLeadFormsList({ params, compact = false, limit, pageId }) {
  const { data, isLoading } = useMetaLeadForms(params);
  if (isLoading) return <TableSkeleton rows={4} cols={compact ? 3 : 6} />;
  const all = pageId ? (data || []).filter((f) => f.pageId === pageId) : data || [];
  const rows = limit ? all.slice(0, limit) : all;
  if (!rows.length) {
    return <EmptyState icon={FileText} title="No Meta lead forms yet" description="Forms appear after Meta is connected under Super Admin > Integrations." />;
  }

  if (compact) {
    return (
      <ul className="divide-y">
        {rows.map((f) => (
          <li key={f.formId}>
            <Link href={formLeadsHref(f.formId)} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[hsl(213_60%_97%)]">
              <div className="min-w-0">
                <p className="truncate font-medium text-[hsl(var(--primary))]">{f.name}</p>
                <p className="truncate text-[11px] text-slate-500">{f.lastLeadAt ? `Last lead ${timeAgo(f.lastLeadAt)}` : 'No leads yet'}{f.newLeads ? ` · ${f.newLeads} new` : ''}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right tabular-nums">
                {f.inRange != null && <span className="text-[12px] text-slate-500" title="Leads in the selected period">+{f.inRange}</span>}
                <span className="w-10 text-[13px] font-semibold text-slate-800">{f.total}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
    <ul className="divide-y md:hidden">
      {rows.map((f) => (
        <li key={f.formId} className="space-y-1.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={formLeadsHref(f.formId)} className="font-medium text-[hsl(var(--primary))] [overflow-wrap:anywhere] hover:underline">{f.name}</Link>
              {f.pageName && <p className="text-[11px] text-slate-500 [overflow-wrap:anywhere]">{f.pageName}</p>}
            </div>
            {f.status && <Badge variant={f.status === 'ACTIVE' ? 'success' : 'secondary'}>{f.status.toLowerCase()}</Badge>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
            <span><b className="font-semibold text-slate-800">{f.total}</b> leads</span>
            <span>{f.newLeads} new</span>
            <span className={cn(f.unassigned && 'text-amber-700')}>{f.unassigned} unassigned</span>
            <span>{f.converted} converted</span>
            <span className="text-slate-500">{f.lastLeadAt ? `Last ${timeAgo(f.lastLeadAt)}` : 'No leads yet'}</span>
          </div>
        </li>
      ))}
    </ul>
    <div className="hidden md:block">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Lead form</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">New</TableHead><TableHead className="text-right">Unassigned</TableHead>
          <TableHead className="text-right">Converted</TableHead><TableHead>Last lead</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((f) => (
          <TableRow key={f.formId}>
            <TableCell className="max-w-[320px]">
              <Link href={formLeadsHref(f.formId)} className="block truncate font-medium text-[hsl(var(--primary))] hover:underline" title={f.name}>{f.name}</Link>
              {f.pageName && <p className="truncate text-[11px] text-slate-500">{f.pageName}</p>}
            </TableCell>
            <TableCell>{f.status ? <Badge variant={f.status === 'ACTIVE' ? 'success' : 'secondary'}>{f.status.toLowerCase()}</Badge> : '—'}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{f.total}</TableCell>
            <TableCell className="text-right tabular-nums">{f.newLeads}</TableCell>
            <TableCell className={cn('text-right tabular-nums', f.unassigned && 'text-amber-700')}>{f.unassigned}</TableCell>
            <TableCell className="text-right tabular-nums">{f.converted}</TableCell>
            <TableCell className="whitespace-nowrap text-[12px] text-slate-500">{f.lastLeadAt ? timeAgo(f.lastLeadAt) : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
    </>
  );
}
