'use client';
import { useUiVersion } from '@/lib/useUiVersion';
import { MetaChannel as LegacyMetaChannel, MpfChannels as LegacyMpfChannels } from '@/components/legacy/MpfChannels';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe2, X, Users2, FileText, ShieldAlert, ChevronRight, Search, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, timeAgo, toQuery } from '@/lib/utils';
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
export function PageAvatar({ page, className }) {
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

/** Identity of the opened Page (avatar, name, counts), shown at the left of the filter card. */
function MetaPageIdentity({ page }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 md:w-[230px] md:shrink-0">
      {page ? <PageAvatar page={page} className="h-9 w-9 shrink-0" />
        : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50"><MetaLogo className="h-5 w-5" tile={false} badge={false} /></span>}
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold leading-tight text-slate-900" title={page ? page.name : 'All Pages'}>{page ? page.name : 'All Pages'}</p>
        <p className="mt-0.5 text-[11.5px] text-slate-500">
          {page ? <><b className="font-semibold tabular-nums text-slate-700">{page.total}</b> leads · <span className={page.today > 0 ? 'font-medium text-emerald-600' : ''}>{page.today} today</span></> : 'Every Meta lead'}
        </p>
      </div>
    </div>
  );
}

function AllPagesLink({ href }) {
  return (
    <Link href={href} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 text-[12.5px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900">
      <ArrowLeft className="h-3.5 w-3.5" />All Pages
    </Link>
  );
}

/** Bold the matched part of a form name. */
function Highlight({ text, term }) {
  if (!term) return text;
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-amber-100 px-0.5 text-slate-900">{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>;
}

/** Every word of the query appears in the name (any order), so "terra hni" finds "Terra & Sol | HNI…". */
const matchesWords = (name, words) => { const n = name.toLowerCase(); return words.every((w) => n.includes(w)); };

/**
 * Lead form picker for the opened Page: type-ahead search with suggestions (counts, last lead, keyboard ↑ ↓ Enter Esc),
 * quick-pick chips for the busiest forms, and the selected form shown as a removable chip. Sets ?formId=.
 */
function MetaFormFilter({ forms, formId, page, backHref }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const set = (id) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('formId', id); else next.delete('formId');
    next.delete('page');
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    setQ(''); setOpen(false);
  };
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sorted = [...forms].sort((x, y) => (y.total - x.total) || String(x.name).localeCompare(String(y.name)));
  const list = (words.length ? sorted.filter((f) => matchesWords(String(f.name || ''), words)) : sorted).slice(0, 50);
  const current = forms.find((f) => f.formId === formId);
  const top = sorted.filter((f) => f.total > 0).slice(0, 5);
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); set(list[hi].formId); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative z-[25] mb-3 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
        <MetaPageIdentity page={page} />
        <span className="hidden h-8 w-px bg-slate-200 md:block" aria-hidden />
        {forms.length > 0 && (
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
            placeholder={`Search ${forms.length} forms by name… e.g. terra hni`} aria-label="Search lead forms" role="combobox"
            aria-expanded={open} aria-controls="meta-form-suggest" aria-autocomplete="list"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-8 text-[13.5px] outline-none transition focus:border-[hsl(var(--ring))] focus:bg-white focus:ring-2 focus:ring-[hsl(var(--ring)/0.15)]" />
          {q && <button type="button" onClick={() => { setQ(''); setHi(0); }} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
          {open && (
            <div id="meta-form-suggest" role="listbox" className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-80 overflow-auto rounded-lg border bg-white py-1 shadow-lg">
              <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {words.length ? `${list.length}${list.length === 50 ? '+' : ''} matching form${list.length === 1 ? '' : 's'}` : 'Most leads first'}
              </p>
              {!words.length && (
                <button type="button" role="option" aria-selected={!formId} onMouseDown={(e) => e.preventDefault()} onClick={() => set('')}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-slate-50">
                  <span className="font-medium text-slate-700">All forms</span><span className="text-[12px] text-slate-500">{forms.length} forms</span>
                </button>
              )}
              {list.map((f, i) => (
                <button key={f.formId} type="button" role="option" aria-selected={f.formId === formId} onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => set(f.formId)}
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', i === hi ? 'bg-[hsl(var(--accent))]' : 'hover:bg-slate-50')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-slate-900"><Highlight text={String(f.name)} term={words[0]} /></span>
                    <span className="block text-[11.5px] text-slate-500">{f.lastLeadAt ? `Last lead ${timeAgo(f.lastLeadAt)}` : 'No leads yet'}{f.status && f.status !== 'ACTIVE' ? ` · ${String(f.status).toLowerCase()}` : ''}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-slate-700">{f.total}</span>
                  {f.formId === formId && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
                </button>
              ))}
              {!list.length && <p className="px-3 py-4 text-center text-[13px] text-slate-500">No form matches “{q}”. Try fewer words.</p>}
            </div>
          )}
        </div>
        )}
        {!forms.length && <div className="flex-1" />}
        {current && (
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1 text-[12.5px] text-indigo-900">
            <span className="truncate" title={current.name}>{current.name}</span>
            <span className="rounded-full bg-white px-1.5 text-[11px] font-semibold tabular-nums">{current.total}</span>
            <button type="button" onClick={() => set('')} aria-label="Remove form filter" className="rounded-full p-0.5 hover:bg-indigo-100"><X className="h-3.5 w-3.5" /></button>
          </span>
        )}
        <AllPagesLink href={backHref} />
      </div>
      {!current && top.length > 1 && (
        <div className="rounded-b-xl border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><FileText className="h-3.5 w-3.5" />Top forms</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {top.map((f) => (
              <button key={f.formId} type="button" onClick={() => set(f.formId)} title={f.name}
                className="group flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-[hsl(var(--ring))] hover:shadow-sm">
                <span className="truncate text-[12.5px] text-slate-700 group-hover:text-slate-900">{f.name}</span>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-indigo-700">{f.total}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Meta channel view. Used inside MPF Leads (?channel=meta) and standalone at /crm/meta (sidebar). */
function MetaChannelV2({ standalone = false }) {
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
  // Forms of the opened Page only, so the tab count, search box and form list all agree.
  const pageForms = (forms || []).filter((f) => !pageId || f.pageId === pageId);
  const tabs = [
    { key: 'leads', label: 'Leads', icon: Users2, href: `${pathname}?channel=meta${pageId ? `&pageId=${pageId}` : ''}`, count: openPage ? openPage.total : pipe?.counts?.mpf?.total },
    { key: 'junk', label: 'Junk & test', icon: ShieldAlert, href: `${pathname}?channel=meta&junk=only`, count: junkCount },
    { key: 'forms', label: 'Lead forms', icon: FileText, href: `${pathname}?channel=meta&tab=forms${pageId ? `&pageId=${pageId}` : ''}`, count: forms ? pageForms.length : undefined },
  ];
  return (
    <>
      <ChannelHeader channel="meta" tab={tab} tabs={tabs} standalone={standalone} />
      {tab === 'forms' ? <Card className="overflow-hidden"><MetaLeadFormsList pageId={pageId || undefined} /></Card> : landing ? <MetaPageGrid pages={metaPages} hrefFor={pageHref} unseen={unseen} /> : (
        <>
          {(pageId || showAll) && <MetaFormFilter forms={showAll ? (forms || []) : pageForms} formId={formId} page={openPage} backHref={pageHref(null)} />}
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
function MpfChannelsV2() {
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

export function MetaChannel(props) { const v = useUiVersion(); if (v === null) return null; return v === 2 ? <MetaChannelV2 {...props} /> : <LegacyMetaChannel {...props} />; }
export function MpfChannels(props) { const v = useUiVersion(); if (v === null) return null; return v === 2 ? <MpfChannelsV2 {...props} /> : <LegacyMpfChannels {...props} />; }
