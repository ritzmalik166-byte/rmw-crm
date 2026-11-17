'use client';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Handshake, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { EmptyState } from '@/components/ui/feedback';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';

/**
 * /crm/client-leads: leads sent by client landing pages through the Lead Capture API.
 * One card per client (the API key name) with its projects; click a card to see only that client's leads.
 */
function ClientLeads() {
  const params = useSearchParams();
  const active = params.get('clientName') || '';
  const { data, isLoading } = useQuery({ queryKey: ['leads', 'client-sources'], queryFn: () => api('/crm/client-sources'), staleTime: 30_000 });
  const clients = data || [];
  const total = clients.reduce((n, c) => n + c.total, 0);

  return (
    <>
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"><Handshake className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Lead channel</p>
            <h1 className="truncate text-[17px] font-semibold leading-tight text-slate-900">Client Leads</h1>
            <p className="hidden truncate text-[12px] text-slate-500 sm:block">Enquiries from client landing pages (Lead Capture API) and client Meta lead forms, grouped by client and project.</p>
          </div>
        </div>
        {clients.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-slate-100 px-3 py-3 [scrollbar-width:none]">
            <ClientChip href="/crm/client-leads" active={!active} title="All clients" sub={`${clients.length} client${clients.length === 1 ? '' : 's'}`} count={total} />
            {clients.map((c) => (
              <ClientChip key={c.client} href={c.clientName ? `/crm/client-leads?clientName=${encodeURIComponent(c.clientName)}` : null} active={active === c.clientName}
                title={c.client} sub={c.projects.join(', ') || 'No project'} count={c.total} today={c.today} last={c.lastLeadAt} />
            ))}
          </div>
        )}
      </div>

      {active && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-[13px] text-indigo-950">
          <span className="truncate">Client: <b>{active}</b></span>
          <Link href="/crm/client-leads" className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"><X className="h-3.5 w-3.5" />All clients</Link>
        </div>
      )}

      {!isLoading && clients.length === 0 && !active ? (
        <EmptyState icon={Handshake} title="No client leads yet"
          description="Create an API key in Super Admin → Integrations → Lead capture API and share the code with the client. Their landing-page leads will appear here." />
      ) : (
        <LeadsWorkspace key={`client-${active}`} pipelineKey="all" channel="client" />
      )}
    </>
  );
}

function ClientChip({ href, active, title, sub, count, today, last }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <span className={cn('rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums', active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')}>{count}</span>
      </div>
      <p className="truncate text-[11.5px] text-slate-500" title={sub}>{sub}</p>
      {(today > 0 || last) && <p className="text-[11px] text-slate-400">{today > 0 ? <span className="font-medium text-emerald-600">{today} today</span> : `Last lead ${timeAgo(last)}`}</p>}
    </>
  );
  const cls = cn('block w-[220px] shrink-0 rounded-lg border px-3 py-2 text-left transition',
    active ? 'border-indigo-300 bg-indigo-50/70 text-indigo-950' : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50');
  return href ? <Link href={href} scroll={false} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export default function ClientLeadsPage() {
  const { can } = useAuth();
  if (!can('lead.channel.client')) {
    return <EmptyState title="No access to Client Leads" description="Ask a Super Admin to grant your role the “View Client Leads” permission (Super Admin → Roles)." />;
  }
  return <Suspense><ClientLeads /></Suspense>;
}
