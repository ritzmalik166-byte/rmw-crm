'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe2, X, Users2, FileText, ShieldAlert, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, toQuery } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';
import { MetaLogo } from '@/components/integrations/MetaLogo';
import { MetaLeadFormsList, useMetaLeadForms } from '@/components/marketing/MetaLeadForms';
import { EmptyState } from '@/components/ui/feedback';

export function MetaNoAccess() {
  return <EmptyState title="No access to Meta leads" description="Ask a Super Admin to grant your role the “View Meta leads” permission (Super Admin → Roles)." />;
}

const WebsiteIcon = ({ className }) => (
  <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100', className)}><Globe2 className="h-5 w-5" /></span>
);

const CHANNELS = {
  website: { title: 'Website / App Leads', description: 'Enquiries from mypropertyfact.in, the app and manual entries. Meta leads are under Lead channels → Meta Leads.', Icon: WebsiteIcon, accent: 'border-t-teal-500' },
  meta: { title: 'Meta Leads', description: 'Facebook + Instagram lead form submissions, with campaign and form.', Icon: MetaLogo, accent: 'border-t-[#0082FB]' },
};

/** Page header for a channel: back link, logo + title, and (Meta) underline tabs Leads / Lead forms. */
function ChannelHeader({ channel, tab, tabs, standalone = false, eyebrow = null }) {
  const pathname = usePathname();
  const { title, description, Icon } = CHANNELS[channel];
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        {!standalone && (
          <Link href={pathname} aria-label="Back to MPF Leads" title="Back to MPF Leads"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[hsl(var(--primary))]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <Icon />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{eyebrow || (standalone ? 'Lead channel' : 'MPF Leads')}</p>
          <h1 className="truncate text-[17px] font-semibold leading-tight text-slate-900">{title}</h1>
          <p className="hidden truncate text-[12px] text-slate-500 sm:block">{description}</p>
        </div>
      </div>
      {tabs && (
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 [scrollbar-width:none]" aria-label={`${title} sections`}>
          {tabs.map((t) => (
            <Link key={t.key} href={t.href} scroll={false} aria-current={tab === t.key ? 'page' : undefined}
              className={cn('flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition',
                tab === t.key ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.count != null && (
                <span className={cn('rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums', tab === t.key ? 'bg-[hsl(213_70%_94%)] text-[hsl(var(--primary))]' : 'bg-slate-100 text-slate-600')}>{t.count}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Page avatar: Facebook's public Page picture, falling back to the first letter when it can't load. */
function PageAvatar({ page, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={cn('flex items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700', className)}>{page.name?.[0]?.toUpperCase() || 'P'}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={page.picture} alt="" className={cn('rounded-full object-cover ring-1 ring-slate-200', className)} onError={() => setFailed(true)} referrerPolicy="no-referrer" />;
}

const Stat = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className={cn('text-[16px] font-semibold tabular-nums', tone)}>{value}</p></div>
);

/**
 * Landing view of Meta Leads: one large card per Facebook Page (Eldeco Group, Premium Properties, My Property Fact…).
 * Leads are shown only after a card is opened (?pageId=…); "All Pages" (?pages=all) lists every Meta lead.
 */
const SEEN_KEY = 'rmw.metaPageSeen';
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; } };
const writeSeen = (m) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* ignore */ } };

/** Per-Page "new since you last opened it" counts, remembered in this browser. First sight of a Page = nothing unseen. */
function useUnseenLeads(pages, openPageId) {
  const [seen, setSeen] = useState({});
  useEffect(() => {
    if (!pages?.length) return;
    const m = readSeen();
    let changed = false;
    for (const p of pages) {
      if (m[p.id] == null || p.id === openPageId) { if (m[p.id] !== p.total) { m[p.id] = p.total; changed = true; } }
    }
    if (changed) writeSeen(m);
    setSeen(m);
  }, [pages, openPageId]);
  return (p) => Math.max(0, p.total - (seen[p.id] ?? p.total));
}

function MetaPageGrid({ pages, hrefFor, unseen }) {
  const total = pages.reduce((a, p) => a + p.total, 0);
  const today = pages.reduce((a, p) => a + p.today, 0);
  const box = 'group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-400 hover:shadow-md';
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {pages.map((p) => (
        <Link key={p.id} href={hrefFor(p.id)} className={cn(box, 'relative', unseen(p) > 0 && 'border-red-300 ring-1 ring-red-200')}>
          {unseen(p) > 0 && (
            <span className="absolute -right-2 -top-2 flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11.5px] font-semibold text-white shadow">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{unseen(p)} new
            </span>
          )}
          <div className="flex items-center gap-3">
            <PageAvatar page={p} className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-slate-900">{p.name}</p>
              <p className="text-[12px] text-slate-500">{p.category || 'Facebook Page'}</p>
              {!p.active && <p className="text-[11.5px] text-amber-700">Page switched off: new leads paused</p>}
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-600" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Leads" value={p.total} />
            <Stat label="Today" value={p.today} tone="text-emerald-700" />
            <Stat label="New" value={p.newLeads} tone="text-blue-700" />
          </div>
          <p className="text-[12px] font-medium text-blue-700 group-hover:underline">View leads →</p>
        </Link>
      ))}
      <Link href={hrefFor('all')} className={cn(box, 'border-dashed')}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><MetaLogo className="h-7 w-7" tile={false} badge={false} /></span>
          <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold text-slate-900">All Pages</p><p className="text-[12px] text-slate-500">Every Meta lead together</p></div>
          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-600" />
        </div>
        <div className="grid grid-cols-3 gap-2"><Stat label="Leads" value={total} /><Stat label="Today" value={today} tone="text-emerald-700" /><Stat label="Pages" value={pages.length} /></div>
        <p className="text-[12px] font-medium text-blue-700 group-hover:underline">View all leads →</p>
      </Link>
    </div>
  );
}

/** Header shown above the leads of one opened Page, with a way back to the Page cards. */
function MetaPageBar({ page, backHref }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {page ? <PageAvatar page={page} className="h-10 w-10 shrink-0" />
          : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white"><MetaLogo className="h-6 w-6" tile={false} badge={false} /></span>}
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-slate-900">{page ? page.name : 'All Pages'}</p>
          <p className="text-[12px] text-slate-600">{page ? `${page.total} leads · ${page.today} today` : 'Every Meta lead from all Pages'}</p>
        </div>
      </div>
      <Link href={backHref} className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">
        <ArrowLeft className="h-3.5 w-3.5" />All Pages
      </Link>
    </div>
  );
}

/** Lead form name filter for the opened Page: picks ?formId=, keeps the Page and other filters. */
function MetaFormFilter({ forms, formId }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  if (!forms.length) return null;
  const set = (id) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('formId', id); else next.delete('formId');
    next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const term = q.trim().toLowerCase();
  const list = forms.filter((f) => !term || f.name?.toLowerCase().includes(term) || f.formId === formId);
  const current = forms.find((f) => f.formId === formId);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <FileText className="h-4 w-4 shrink-0 text-indigo-600" />
      <span className="text-[12.5px] font-medium text-slate-700">Lead form</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search form name…" aria-label="Search lead forms"
        className="h-9 w-48 rounded-md border border-slate-200 px-2.5 text-[13px] outline-none focus:border-blue-400" />
      <select value={formId || ''} onChange={(e) => set(e.target.value)} aria-label="Filter by lead form"
        className="h-9 min-w-0 max-w-full flex-1 rounded-md border border-slate-200 bg-white px-2 text-[13px] outline-none focus:border-blue-400 sm:max-w-md">
        <option value="">All forms ({forms.length})</option>
        {list.map((f) => <option key={f.formId} value={f.formId}>{f.name} · {f.total} leads</option>)}
      </select>
      {current && <button type="button" onClick={() => set('')} className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-700 hover:underline"><X className="h-3.5 w-3.5" />Clear</button>}
    </div>
  );
}

/** Meta channel view. Used inside MPF Leads (?channel=meta) and standalone at /crm/meta (sidebar). */
export function MetaChannel({ standalone = false }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = params.get('tab') === 'forms' ? 'forms' : params.get('junk') === 'only' ? 'junk' : 'leads';
  const formId = params.get('formId');
  const { data: forms } = useMetaLeadForms();
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines', 'meta'], queryFn: () => api('/crm/pipelines?channel=meta'), staleTime: 60_000 });
  const { data: junkCount } = useQuery({
    queryKey: ['leads', 'channel', 'meta', 'junk'],
    queryFn: () => api(`/crm/leads${toQuery({ pipeline: 'mpf', channel: 'meta', junk: 'only', limit: 1 })}`).then((r) => r?.meta?.total ?? 0),
    staleTime: 60_000,
  });
  const form = formId ? forms?.find((f) => f.formId === formId) : null;
  const pageId = params.get('pageId');
  const { data: metaPages } = useQuery({ queryKey: ['meta', 'page-cards'], queryFn: () => api('/crm/meta/pages'), staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const unseen = useUnseenLeads(metaPages, params.get('pageId'));
  const showAll = params.get('pages') === 'all';
  const junkQ = tab === 'junk' ? 'only' : undefined;
  const pageHref = (id) => `${pathname}${toQuery({ channel: 'meta', junk: junkQ, ...(id === 'all' ? { pages: 'all' } : { pageId: id || undefined }) })}`;
  const openPage = pageId ? metaPages?.find((p) => p.id === pageId) : null;
  // Landing: Page cards only. Leads appear once a card (or "All Pages") is opened, or when arriving with a form filter.
  const landing = Boolean(metaPages?.length) && !pageId && !showAll && !formId;
  const tabs = [
    { key: 'leads', label: 'Leads', icon: Users2, href: `${pathname}?channel=meta`, count: openPage ? openPage.total : pipe?.counts?.mpf?.total },
    { key: 'junk', label: 'Junk & test', icon: ShieldAlert, href: `${pathname}?channel=meta&junk=only`, count: junkCount },
    { key: 'forms', label: 'Lead forms', icon: FileText, href: `${pathname}?channel=meta&tab=forms`, count: forms?.length },
  ];
  return (
    <>
      <ChannelHeader channel="meta" tab={tab} tabs={tabs} standalone={standalone} />
      {tab === 'forms' ? <Card className="overflow-hidden"><MetaLeadFormsList /></Card> : landing ? <MetaPageGrid pages={metaPages} hrefFor={pageHref} unseen={unseen} /> : (
        <>
          {(pageId || showAll) && <MetaPageBar page={openPage} backHref={pageHref(null)} />}
          {(pageId || showAll) && <MetaFormFilter forms={(forms || []).filter((f) => showAll || f.pageId === pageId)} formId={formId} />}
          {formId && !pageId && !showAll && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[13px] text-blue-950">
              <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">Form: <b>{form?.name || formId}</b></span></span>
              <Link href={`${pathname}?channel=meta`} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"><X className="h-3.5 w-3.5" />All Meta leads</Link>
            </div>
          )}
          {tab === 'junk' && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Meta leads flagged automatically: test leads (Meta&apos;s testing tool), repeat submissions within 24 hours, fake numbers, spam and internal entries. Each row shows the reason. They are kept here and never counted in the main numbers.</span>
            </p>
          )}
          <LeadsWorkspace key={`mpf-meta-${tab}-${formId || ''}-${pageId || ''}`} pipelineKey="mpf" channel="meta" />
        </>
      )}
    </>
  );
}

/**
 * MPF Leads: Website / App leads only. Meta leads live in their own section (/crm/meta, sidebar → Lead channels).
 * Old MPF links to the Meta channel (?channel=meta, ?formId=…, ?tab=forms) are forwarded there.
 */
export function MpfChannels() {
  const params = useSearchParams();
  const router = useRouter();
  const isMetaLink = params.get('channel') === 'meta' || params.get('formId') || params.get('tab') === 'forms';

  useEffect(() => {
    if (!isMetaLink) return;
    const sp = new URLSearchParams(params.toString());
    sp.delete('channel');
    router.replace(`/crm/meta${sp.toString() ? `?${sp}` : ''}`);
  }, [isMetaLink, params, router]);

  if (isMetaLink) return null;
  return (
    <>
      <ChannelHeader channel="website" standalone eyebrow="MPF Leads" />
      <LeadsWorkspace key="mpf-website" pipelineKey="mpf" channel="website" />
    </>
  );
}
