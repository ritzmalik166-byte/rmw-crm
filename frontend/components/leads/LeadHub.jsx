'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Globe2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { PIPELINES, PipelineLogo, usePipelineOrder } from '@/lib/pipelines';
import { MetaLogo } from '@/components/integrations/MetaLogo';

/** Phone / tablet Leads flow: Leads → (Website / App → brand cards) or (Meta → Page cards) → leads. */
const useWebsiteCounts = () => useQuery({ queryKey: ['leads', 'pipelines', 'website'], queryFn: () => api('/crm/pipelines?channel=website'), staleTime: 30_000, refetchInterval: 30_000 });
const useMetaPages = () => useQuery({ queryKey: ['meta', 'page-cards'], queryFn: () => api('/crm/meta/pages'), staleTime: 15_000, refetchInterval: 30_000 });

function Tile({ href, logo, name, sub, total, stats = [], foot }) {
  return (
    <Link href={href} className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-blue-300 hover:shadow-md active:bg-slate-50">
      <div className="flex items-center gap-2.5">
        {logo}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-900" title={name}>{name}</p>
          {sub && <p className="truncate text-[11.5px] text-slate-500">{sub}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-blue-600" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">{total ?? '–'}<span className="ml-1 text-[12px] font-medium text-slate-500">leads</span></p>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-2 py-1.5">
            <p className={cn('text-[14px] font-semibold tabular-nums', value > 0 ? tone : 'text-slate-400')}>{value ?? '–'}</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      {foot && <p className="-mt-1 truncate text-[11.5px] text-slate-500">{foot}</p>}
    </Link>
  );
}

const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';
const webStats = (x) => [['Today', x?.today, 'text-emerald-700'], ['New', x?.new_leads ?? x?.newLeads, 'text-blue-700'], ['Unassigned', x?.unassigned, 'text-amber-700']];

export function LeadHub() {
  const { data: web } = useWebsiteCounts();
  const order = usePipelineOrder();
  const { data: pages } = useMetaPages();
  const { data: meta } = useQuery({ queryKey: ['leads', 'pipelines', 'meta'], queryFn: () => api('/crm/pipelines?channel=meta'), staleTime: 30_000, refetchInterval: 30_000 });
  const c = web?.counts || {};
  const add = (rows) => rows.reduce((a, x) => { ['total', 'today', 'new_leads', 'unassigned'].forEach((k) => { a[k] += Number(x?.[k] || 0); }); return a; }, { total: 0, today: 0, new_leads: 0, unassigned: 0 });
  const w = web ? add(order.map((k) => c[k])) : null;
  const m = meta?.counts?.mpf || (pages ? add(pages.map((p) => ({ ...p, new_leads: p.newLeads }))) : null);
  const lastMeta = pages?.map((p) => p.lastLeadAt).filter(Boolean).sort().pop();
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-[20px] font-semibold text-slate-900">Leads</h1>
      <div className={GRID}>
        <Tile href="/crm/lead-hub/website" name="Website / App" sub={`${order.length} brand${order.length === 1 ? '' : 's'} · ${order.map((k) => PIPELINES[k].short).join(', ')}`} total={w?.total} stats={webStats(w)}
          logo={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Globe2 className="h-5 w-5" /></span>} />
        <Tile href="/crm/meta" name="Meta" sub={pages ? `${pages.length} pages · Facebook + Instagram` : 'Facebook + Instagram'} total={m?.total} stats={webStats(m)}
          foot={lastMeta ? `Last lead ${timeAgo(lastMeta)}` : null}
          logo={<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200"><MetaLogo className="h-6 w-6" tile={false} badge={false} /></span>} />
      </div>
      <Link href="/crm/leads" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-blue-700">See all leads together<ChevronRight className="h-4 w-4" /></Link>
    </div>
  );
}

export function WebsiteHub() {
  const { data: web } = useWebsiteCounts();
  const order = usePipelineOrder();
  const c = web?.counts || {};
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-[20px] font-semibold text-slate-900">Website / App</h1>
      <div className={GRID}>
        {order.map((k) => (
          <Tile key={k} href={`/crm/pipeline/${k}`} logo={<PipelineLogo src={PIPELINES[k].logo} className="h-10 w-10" />} name={PIPELINES[k].title} sub={PIPELINES[k].description} total={c[k]?.total} stats={webStats(c[k])}
            foot={c[k]?.overdue > 0 ? `${c[k].overdue} overdue follow-ups` : null} />
        ))}
      </div>
    </div>
  );
}
