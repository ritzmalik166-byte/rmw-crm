'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Download, Palette, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { setUiVersion, useUiVersion } from '@/lib/useUiVersion';
import { useAuth } from '@/providers/AuthProvider';

/**
 * UI version gate. Everyone starts on the 1.0 screens and sees an "Update available" card. Installing runs real
 * work (loads each new screen's code and warms its data) with a genuine elapsed-time clock: progress on the left,
 * a preview of what each step brings on the right. Afterwards a short guided tour (skippable) shows what's new.
 */
const TOUR_KEY = 'crm:tour2';

const FEATURES = [
  'Deep-navy sidebar with clean white cards',
  'One bright action blue across buttons and links',
  'Calmer page background and softer shadows',
  'Bigger, sharper brand logos',
  'Leads split into Website / App and Meta cards',
  'Tablet top strip and app-style phone layout',
];

// Steps of the install. `preview` picks the picture shown on the right while the step runs.
const SCREENS = [
  { href: '/crm/dashboard', title: 'Dashboard', preview: 'dashboard' },
  { href: '/crm/lead-hub', title: 'Leads hub', preview: 'hub' },
  { href: '/crm/leads', title: 'All Leads', preview: 'list' },
  { href: '/crm/meta', title: 'Meta Leads', preview: 'meta' },
  { href: '/crm/followups', title: 'Follow-ups', preview: 'followups' },
  { href: '/crm/settings', title: 'Settings', preview: 'settings' },
];

// Guided tour after installing. `target` is spotlighted when it's on screen; otherwise the card sits in the middle.
const TOUR = [
  { href: '/crm/dashboard', title: 'Welcome to RMW CRM 2.0', text: 'A quick look at what changed. It takes under a minute, or skip it any time.' },
  { href: '/crm/dashboard', target: 'aside', title: 'New sidebar', text: 'Deep-navy sidebar with bigger brand logos. Press Ctrl + B to collapse it to icons.' },
  { href: '/crm/dashboard', target: 'header', title: 'Top bar', text: 'Search any lead with Ctrl + K. The bell shows assignments and reminders.' },
  { href: '/crm/lead-hub', target: 'main', title: 'Leads hub', text: 'On phones and tablets, Leads opens two cards: Website / App and Meta. Each shows today, new and unassigned counts.' },
  { href: '/crm/leads', target: 'main', title: 'All Leads', text: 'Reload and Export now sit in the filter row, and the list refreshes by itself every 30 seconds.' },
  { href: '/crm/meta', target: 'main', title: 'Meta Leads', text: 'Each Facebook page with its own forms. Form counts now match the page you are on.' },
  { href: '/crm/settings', target: 'main', title: 'Make it yours', text: 'Pick your accent colour, density and text size under Appearance.' },
];

const STEP_MIN_MS = 1800; // each step stays on screen at least this long (the work itself has already finished)
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const getTour = () => { try { return localStorage.getItem(TOUR_KEY); } catch { return null; } };
const setTour = (v) => { try { localStorage.setItem(TOUR_KEY, v); } catch { /* blocked */ } };

/* ── Right-hand previews: simple wireframes of each new screen in the 2.0 colours ── */
const Bar = ({ w = '100%', c = 'bg-slate-200', h = 'h-2' }) => <div className={`${h} rounded ${c}`} style={{ width: w }} />;
const n = (v) => (v == null ? '–' : Number(v).toLocaleString('en-IN'));
const sum = (rows, k) => rows.reduce((a, x) => a + Number(x?.[k] || 0), 0);
const hhmm = (d) => { try { return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** The previews below use the signed-in user's own data (fetched in the first install step); wireframe bars fill in while it loads or when there's none. */
function Preview({ kind, d = {}, name }) {
  const web = Object.values(d.web?.counts || {});
  const pages = Array.isArray(d.pages) ? d.pages : [];
  const fups = d.fups?.rows || [];
  const leads = d.leads?.rows || [];
  const metaTotals = { total: sum(pages, 'total'), today: sum(pages, 'today'), new_leads: sum(pages, 'newLeads'), unassigned: sum(pages, 'unassigned') };
  const webTotals = { total: sum(web, 'total'), today: sum(web, 'today'), new_leads: sum(web, 'new_leads'), unassigned: sum(web, 'unassigned') };
  const real = {
    dashboard: (
      <div className="space-y-4 p-5">
        <p className="text-[17px] font-bold text-slate-900">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}{name ? `, ${name.split(' ')[0]}` : ''}</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[['Leads today', webTotals.today + metaTotals.today], ['New', webTotals.new_leads + metaTotals.new_leads], ['Waiting for an owner', webTotals.unassigned + metaTotals.unassigned], ['Follow-ups today', d.fups ? (d.fups.total ?? fups.length) : null]].map(([l, v], i) => (
            <div key={l} className={`rounded-xl border bg-white p-3 ${i === 2 && v ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200'}`}><p className="text-xl font-bold text-slate-900">{n(d.web || d.pages ? v : null)}</p><p className="text-[11.5px] text-slate-500">{l}</p></div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="mb-2 text-[12px] font-semibold text-slate-700">Latest leads</p>
          {(leads.length ? leads.slice(0, 4) : [0, 1, 2]).map((l, i) => <div key={l.id || i} className="flex items-center gap-2 border-t border-slate-100 py-1.5 text-[12px] first:border-0">{l.id ? <><span className="font-medium text-slate-800">{l.name || 'Unnamed'}</span><span className="ml-auto text-slate-400">{l.website_code || ''}</span></> : <Bar w="50%" />}</div>)}
        </div>
      </div>
    ),
    hub: (
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        {[['Website / App', webTotals, 'bg-teal-500', `${web.length || 4} brands`], ['Meta', metaTotals, 'bg-blue-600', `${pages.length} pages`]].map(([t, x, c, sub]) => (
          <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2"><span className={`h-6 w-6 rounded-md ${c}`} /><div><p className="text-[13px] font-semibold text-slate-800">{t}</p><p className="text-[11px] text-slate-500">{sub}</p></div></div>
            <p className="mt-3 text-3xl font-bold text-slate-900">{n(d.web || d.pages ? x.total : null)}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">{[['Today', x.today], ['New', x.new_leads], ['Unassigned', x.unassigned]].map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 px-2 py-1.5"><p className="text-[13px] font-semibold text-slate-800">{n(d.web || d.pages ? v : null)}</p><p className="text-[10.5px] text-slate-500">{l}</p></div>)}</div>
          </div>
        ))}
      </div>
    ),
    list: (
      <div className="space-y-2 p-5">
        <div className="flex gap-2"><div className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[12px] leading-8 text-slate-400">Search leads…</div><span className="rounded-md border border-slate-200 bg-white px-3 text-[12px] leading-8 text-slate-600">Reload</span><span className="rounded-md bg-blue-600 px-3 text-[12px] leading-8 text-white">Export</span></div>
        {(leads.length ? leads.slice(0, 6) : [0, 1, 2, 3, 4]).map((l, i) => (
          <div key={l.id || i} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-[12px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{l.name?.[0] || ''}</span>
            {l.id ? <><div className="min-w-0"><p className="truncate font-medium text-slate-800">{l.name || 'Unnamed'}</p><p className="truncate text-[11px] text-slate-500">{l.assigned_to || l.owner_name || 'Unassigned'}</p></div><span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{l.status_name || l.status || 'New'}</span></> : <Bar w="40%" />}
          </div>
        ))}
      </div>
    ),
    meta: (
      <div className="space-y-2 p-5">
        {(pages.length ? pages.slice(0, 5) : [0, 1, 2]).map((p, i) => (
          <div key={p.id || i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            {p.picture ? <img src={p.picture} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[12px] font-bold text-blue-600">{p.name?.[0] || ''}</span>}
            <div className="min-w-0 flex-1">{p.id ? <><p className="truncate text-[13px] font-semibold text-slate-800">{p.name}</p><p className="text-[11px] text-slate-500">{n(p.today)} today · {n(p.unassigned)} unassigned</p></> : <Bar w="50%" />}</div>
            {p.id && <span className="text-[15px] font-bold text-slate-900">{n(p.total)}</span>}
          </div>
        ))}
        {!pages.length && d.pages && <p className="text-center text-[12px] text-slate-500">No Meta pages connected yet.</p>}
      </div>
    ),
    followups: (
      <div className="space-y-2 p-5">
        <div className="flex gap-1.5">{['Due today', 'Overdue', 'Upcoming'].map((t, i) => <span key={t} className={`rounded-full px-3 py-1 text-[11px] font-medium ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</span>)}</div>
        {(fups.length ? fups.slice(0, 5) : d.fups ? [] : [0, 1, 2]).map((f, i) => (
          <div key={f.id || i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px]"><span className="h-7 w-1 rounded bg-amber-400" />{f.id ? <><span className="truncate font-medium text-slate-800">{f.lead_name || f.external_lead_id}</span><span className="ml-auto shrink-0 text-slate-500">{hhmm(f.due_at)}</span></> : <Bar w="45%" />}</div>
        ))}
        {d.fups && !fups.length && <p className="pt-4 text-center text-[12px] text-slate-500">Nothing due today. You're all caught up.</p>}
      </div>
    ),
  };
  const body = real[kind] || {
    theme: (
      <div className="grid h-full grid-cols-3 gap-3 p-4">
        {[['#0b1734', 'Sidebar'], ['#2563eb', 'Action blue'], ['#f6f8fc', 'Page']].map(([c, n]) => (
          <div key={n} className="flex flex-col justify-end rounded-lg border border-slate-200 p-2" style={{ background: c }}>
            <span className={`text-[10px] font-medium ${c === '#f6f8fc' ? 'text-slate-600' : 'text-white/90'}`}>{n}</span>
          </div>
        ))}
      </div>
    ),
    dashboard: (
      <div className="space-y-3 p-4">
        <Bar w="45%" h="h-3" c="bg-slate-800" />
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-12 rounded-lg border ${i === 2 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`} />)}</div>
        <div className="grid grid-cols-3 gap-2"><div className="col-span-2 h-20 rounded-lg border border-slate-200 bg-white p-2"><svg viewBox="0 0 100 30" className="h-full w-full"><polyline points="0,25 15,18 30,20 45,10 60,14 75,6 100,9" fill="none" stroke="#2563eb" strokeWidth="2" /></svg></div><div className="h-20 rounded-lg border border-slate-200 bg-white" /></div>
      </div>
    ),
    hub: (
      <div className="grid h-full grid-cols-2 gap-3 p-4">
        {['Website / App', 'Meta'].map((t, i) => (
          <div key={t} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-1.5"><span className={`h-4 w-4 rounded ${i ? 'bg-blue-600' : 'bg-teal-500'}`} /><span className="text-[10px] font-semibold text-slate-700">{t}</span></div>
            <p className="mt-2 text-lg font-bold text-slate-900">{i ? 143 : 412}</p>
            <div className="mt-2 grid grid-cols-3 gap-1">{[0, 1, 2].map((k) => <div key={k} className="h-6 rounded bg-slate-100" />)}</div>
          </div>
        ))}
      </div>
    ),
    list: (
      <div className="space-y-2 p-4">
        <div className="flex gap-2"><div className="h-7 flex-1 rounded-md border border-slate-200 bg-white" /><div className="h-7 w-14 rounded-md border border-slate-200 bg-white" /><div className="h-7 w-14 rounded-md bg-blue-600" /></div>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1.5"><span className="h-5 w-5 rounded-full bg-slate-200" /><Bar w="30%" /><span className="ml-auto h-4 w-12 rounded-full bg-emerald-100" /></div>)}
      </div>
    ),
    meta: (
      <div className="space-y-2 p-4">
        {['Eldeco Group', 'Premium Properties', 'Godrej Projects'].map((p, i) => (
          <div key={p} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{p[0]}</span>
            <div className="flex-1"><p className="text-[10.5px] font-semibold text-slate-800">{p}</p><Bar w="40%" h="h-1.5" /></div>
            <span className="text-[11px] font-semibold text-slate-700">{[86, 41, 16][i]}</span>
          </div>
        ))}
      </div>
    ),
    followups: (
      <div className="space-y-2 p-4">
        <div className="flex gap-1.5">{['Due today', 'Overdue', 'Upcoming'].map((t, i) => <span key={t} className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${i === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</span>)}</div>
        {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"><span className="h-6 w-1 rounded bg-amber-400" /><Bar w="45%" /><span className="ml-auto text-[10px] text-slate-500">{['11:00', '14:30', '17:00'][i]}</span></div>)}
      </div>
    ),
    settings: (
      <div className="space-y-3 p-4">
        <p className="text-[10.5px] font-semibold text-slate-700">Accent colour</p>
        <div className="flex gap-2">{['#2563eb', '#194173', '#0f766e', '#4338ca', '#047857', '#7e2a7e'].map((c, i) => <span key={c} className={`h-7 w-7 rounded-full ${i === 0 ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`} style={{ background: c }} />)}</div>
        <p className="text-[10.5px] font-semibold text-slate-700">Density</p>
        <div className="flex gap-2"><span className="rounded-md bg-blue-600 px-3 py-1 text-[10px] text-white">Comfortable</span><span className="rounded-md bg-slate-100 px-3 py-1 text-[10px] text-slate-600">Compact</span></div>
      </div>
    ),
  }[kind] || null;
  return (
    <div key={kind} className="vu-swap flex h-[min(62vh,560px)] overflow-hidden rounded-xl border border-slate-200 bg-[#f6f8fc] shadow-sm">
      <div className="w-12 shrink-0 space-y-2 bg-[#0b1734] p-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-2 rounded ${i === 0 ? 'bg-blue-500' : 'bg-white/20'}`} />)}</div>
      <div className="min-w-0 flex-1">{body}</div>
    </div>
  );
}

/* ── Guided tour with spotlight ── */
function Tour({ onEnd }) {
  const router = useRouter();
  const pathname = usePathname();
  const [at, setAt] = useState(0);
  const [box, setBox] = useState(null);
  const s = TOUR[at];

  useEffect(() => { if (pathname !== s.href) router.push(s.href); }, [s.href, pathname, router]);

  // Follow the target element (it may mount after navigation, or move on resize/scroll).
  useLayoutEffect(() => {
    if (!s.target) { setBox(null); return undefined; }
    let raf;
    const find = () => {
      const el = [...document.querySelectorAll(s.target)].find((e) => e.offsetWidth && e.offsetHeight);
      const r = el?.getBoundingClientRect();
      setBox(r ? { x: r.left, y: r.top, w: r.width, h: Math.min(r.height, window.innerHeight - r.top) } : null);
      raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [s.target, at]);

  const end = () => { setTour('done'); api('/auth/me/ui', { method: 'PUT', body: { tourDone: true } }).catch(() => {}); onEnd(); };
  const next = () => (at === TOUR.length - 1 ? end() : setAt(at + 1));
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft' && at) setAt(at - 1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // Card beside the spotlight when there's room, else centred.
  const pad = 6;
  let cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' };
  if (box && typeof window !== 'undefined') {
    const W = window.innerWidth;
    if (box.x + box.w + 360 < W) cardStyle = { left: box.x + box.w + 16, top: Math.max(16, Math.min(box.y + 16, window.innerHeight - 240)) };
    else if (box.y + box.h + 220 < window.innerHeight) cardStyle = { left: Math.max(16, Math.min(box.x, W - 356)), top: box.y + box.h + 16 };
  }

  return (
    <div className="fixed inset-0 z-[110]">
      {box
        ? <div className="pointer-events-none absolute rounded-xl ring-2 ring-blue-500 transition-all duration-300" style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2, boxShadow: '0 0 0 9999px rgb(15 23 42 / .55)' }} />
        : <div className="absolute inset-0 bg-slate-900/55" />}
      <div role="dialog" aria-label={s.title} className="vu-swap absolute w-[340px] max-w-[calc(100vw-32px)] rounded-xl border border-slate-200 bg-white p-4 shadow-2xl" style={cardStyle} key={at}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">Step {at + 1} of {TOUR.length}</span>
          <button type="button" className="text-[12px] font-medium text-slate-500 hover:text-slate-900" onClick={end}>Skip tour</button>
        </div>
        <p className="mt-1.5 text-[15px] font-semibold text-slate-900">{s.title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{s.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">{TOUR.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === at ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-200'}`} />)}</div>
          <div className="flex gap-2">
            {at > 0 && <Button size="sm" variant="outline" onClick={() => setAt(at - 1)}><ArrowLeft />Back</Button>}
            <Button size="sm" onClick={next}>{at === TOUR.length - 1 ? <><Check />Finish</> : at === 0 ? <>Start<ArrowRight /></> : <>Next<ArrowRight /></>}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VersionUpdate() {
  const router = useRouter();
  const ver = useUiVersion(); // null until read on the client, so nothing flashes on refresh
  const [phase, setPhase] = useState('idle'); // idle | installing | tour
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(0);
  const stepStart = useRef(0);
  const [data, setData] = useState({});
  const { me } = useAuth();

  // A tour that was started but not finished or skipped resumes after a refresh.
  useEffect(() => { if (ver === 2 && getTour() === 'pending') setPhase('tour'); }, [ver]);

  // Keep this browser and the account in step: installed on another browser -> switch here too (tour only if not
  // finished there); installed here before the account remembered it -> save it to the account.
  const saved = me?.user?.ui_version;
  useEffect(() => {
    if (!me?.user || ver === null) return;
    if (saved === 2 && ver !== 2) {
      if (!getTour()) setTour(me.user.ui_tour_done ? 'done' : 'pending');
      setUiVersion(2);
    } else if (saved !== 2 && ver === 2) {
      api('/auth/me/ui', { method: 'PUT', body: { version: 2, tourDone: getTour() === 'done' } }).catch(() => {});
    }
  }, [saved, ver, me?.user]);

  useEffect(() => {
    if (phase !== 'installing') return undefined;
    let raf;
    const tick = () => { setElapsed(performance.now() - t0.current); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Each step is real work; a step is ticked only after it has actually finished.
  const steps = [
    { name: 'Checking for the update', preview: 'theme', run: () => fetch('/manifest.webmanifest', { cache: 'no-store' }).catch(() => {}) },
    // Your own numbers, used in the previews on the right.
    { name: 'Reading your workspace', preview: 'dashboard', run: () => Promise.all([
      api('/crm/pipelines?channel=website').then((web) => setData((x) => ({ ...x, web }))).catch(() => {}),
      api('/crm/meta/pages').then((pages) => setData((x) => ({ ...x, pages }))).catch(() => setData((x) => ({ ...x, pages: [] }))),
      api('/crm/followups?status=today&scope=mine&limit=5').then((fups) => setData((x) => ({ ...x, fups }))).catch(() => {}),
      api('/crm/leads?limit=6&page=1').then((leads) => setData((x) => ({ ...x, leads }))).catch(() => {}),
    ]) },
    ...SCREENS.map((s) => ({ name: `Installing ${s.title}`, preview: s.preview, run: () => router.prefetch(s.href) })),
    { name: 'Loading fonts', preview: 'theme', run: () => document.fonts?.ready },
    { name: 'Applying the 2.0 theme', preview: 'theme', run: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))) },
  ];

  async function install() {
    t0.current = performance.now();
    setDone(0); setElapsed(0); setPhase('installing');
    for (let i = 0; i < steps.length; i += 1) {
      stepStart.current = performance.now();
      await steps[i].run();
      const left = STEP_MIN_MS - (performance.now() - stepStart.current);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      setDone(i + 1);
    }
    await new Promise((r) => setTimeout(r, 600)); // let "100%" register before switching
    setTour('pending');
    await api('/auth/me/ui', { method: 'PUT', body: { version: 2 } }).catch(() => {});
    setUiVersion(2);
    setPhase('tour');
  }

  if (ver === null) return null;
  if (phase === 'tour') return <Tour onEnd={() => setPhase('idle')} />;

  if (phase === 'installing') {
    const finished = done >= steps.length;
    const inStep = finished ? 0 : Math.min(0.9, (performance.now() - stepStart.current) / STEP_MIN_MS);
    const pct = Math.floor(((done + inStep) / steps.length) * 100);
    const cur = steps[Math.min(done, steps.length - 1)];
    const eta = done ? ((steps.length - done - inStep) * elapsed) / (done + inStep) : (steps.length - inStep) * STEP_MIN_MS;
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-white">
        <style>{`.vu-swap{animation:vu-swap .35s cubic-bezier(.22,.61,.36,1) both}@keyframes vu-swap{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes vu-stripe{to{background-position:24px 0}}`}</style>
        <div className="grid min-h-full md:grid-cols-[minmax(380px,5fr)_7fr]">
          {/* Left: the update */}
          <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-14">
            <div className="flex items-center gap-3">
              <img src="/rmw-mark.png" alt="" className="h-10 w-10 rounded-lg object-contain" />
              <div><p className="text-[15px] font-semibold text-slate-900">RMW CRM 2.0</p><p className="text-[12px] text-slate-500">Updating from 1.0</p></div>
            </div>
            <div className="mt-6 flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-slate-700">{finished ? 'Update complete' : `${cur.name}…`}</p>
              <p className="font-mono text-[13px] tabular-nums text-slate-500">{pct}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-linear"
                style={{ width: `${pct}%`, backgroundImage: finished ? 'none' : 'linear-gradient(45deg,rgb(255 255 255/.18) 25%,transparent 25%,transparent 50%,rgb(255 255 255/.18) 50%,rgb(255 255 255/.18) 75%,transparent 75%)', backgroundSize: '24px 24px', animation: 'vu-stripe 1s linear infinite' }} />
            </div>
            <ol className="mt-5 space-y-2 text-[13px]">
              {steps.map((st, i) => (
                <li key={st.name} className={`flex items-center gap-2.5 ${i < done ? 'text-slate-700' : i === done ? 'font-medium text-slate-900' : 'text-slate-400'}`}>
                  <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${i < done ? 'border-emerald-500 bg-emerald-500 text-white' : i === done ? 'border-blue-600' : 'border-slate-300'}`}>
                    {i < done ? <Check className="h-3 w-3" strokeWidth={3} /> : i === done ? <span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" /> : null}
                  </span>{st.name}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-6 border-t border-slate-100 pt-4 text-[12px] text-slate-500">
              <span>Elapsed <b className="ml-1 font-mono font-semibold tabular-nums text-slate-800">{fmt(elapsed)}</b></span>
              <span>Remaining <b className="ml-1 font-mono font-semibold tabular-nums text-slate-800">{finished ? '00:00' : `~${fmt(eta)}`}</b></span>
            </div>
            <p className="mt-3 text-[11.5px] text-slate-400">Keep this tab open. Your leads and data are not changed.</p>
          </div>
          {/* Right: what this step brings */}
          <div className="flex flex-col justify-center border-t border-slate-200 bg-slate-50 p-6 sm:p-10 md:border-l md:border-t-0 lg:p-14">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{finished ? 'Your new workspace' : 'Now installing'} · with your data</p>
            <p key={cur.name} className="vu-swap mt-1 text-[15px] font-semibold text-slate-900">{finished ? 'All set' : cur.name.replace(/^Installing /, '')}</p>
            <div className="mt-4"><Preview kind={finished ? 'dashboard' : cur.preview} d={data} name={me?.user?.full_name} /></div>
            <div className="mt-4 flex justify-center gap-1.5">
              {steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === done ? 'w-4 bg-blue-600' : i < done ? 'w-1.5 bg-blue-300' : 'w-1.5 bg-slate-300'}`} />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (ver === 2 || hidden) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-[90] mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl lg:bottom-6 lg:right-6 lg:left-auto lg:mx-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Sparkles className="h-[18px] w-[18px]" /></span>
          <div><p className="text-[14px] font-semibold text-slate-900">Update available: 2.0</p><p className="text-[12px] text-slate-500">You're on 1.0 · new look and theme</p></div>
        </div>
        <button type="button" aria-label="Later" className="rounded p-1 text-slate-400 hover:text-slate-700" onClick={() => setHidden(true)}><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-3 space-y-1.5 text-[12.5px] text-slate-700">
        {FEATURES.map((f) => <li key={f} className="flex gap-2"><Palette className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />{f}</li>)}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={install}><Download />Install update</Button>
        <Button variant="outline" onClick={() => setHidden(true)}>Later</Button>
      </div>
    </div>
  );
}
