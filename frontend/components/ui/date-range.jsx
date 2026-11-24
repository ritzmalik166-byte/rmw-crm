'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };

/** Date filters across the CRM are limited to this window (November 2026). Change here to widen it. */
export const FILTER_MIN_DATE = '2026-11-01';
export const FILTER_MAX_DATE = '2026-11-30';
const clampDay = (s) => (s < FILTER_MIN_DATE ? FILTER_MIN_DATE : s > FILTER_MAX_DATE ? FILTER_MAX_DATE : s);
/** Latest selectable day: today, but never past the window. */
export const filterMaxDate = () => clampDay(ymd(new Date()));
const clamp = (r) => ({ from: clampDay(r.from), to: clampDay(r.to) });

/** Preset ranges. Values are YYYY-MM-DD strings; the API treats them as whole IST days. */
export const RANGE_PRESETS = {
  today: { label: 'Today', get: () => clamp({ from: ymd(new Date()), to: ymd(new Date()) }) },
  yesterday: { label: 'Yesterday', get: () => clamp({ from: ymd(shift(-1)), to: ymd(shift(-1)) }) },
  '7d': { label: 'Last 7 days', get: () => clamp({ from: ymd(shift(-6)), to: ymd(new Date()) }) },
  '30d': { label: 'Last 30 days', get: () => clamp({ from: ymd(shift(-29)), to: ymd(new Date()) }) },
  month: { label: 'This month', get: () => { const d = new Date(); return clamp({ from: ymd(new Date(d.getFullYear(), d.getMonth(), 1)), to: ymd(d) }); } },
};

export function rangeLabel(r) {
  if (r.preset === 'all') return 'All time';
  if (r.preset !== 'custom') return RANGE_PRESETS[r.preset].label;
  const f = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

export const todayRange = () => ({ preset: 'today', ...RANGE_PRESETS.today.get() });

/**
 * The period just before `r`, same length: Today → Yesterday, Last 7 days → the 7 days before, and so on.
 * Used for "vs previous period" comparisons. `label` reads naturally after "vs".
 */
export function previousRange(r) {
  const day = (s) => new Date(`${s}T00:00:00`);
  const len = Math.round((day(r.to) - day(r.from)) / 86_400_000) + 1;
  const to = day(r.from); to.setDate(to.getDate() - 1);
  const from = new Date(to); from.setDate(from.getDate() - (len - 1));
  const label = r.preset === 'today' ? 'yesterday' : r.preset === 'yesterday' ? 'day before' : len === 1 ? 'previous day' : `previous ${len} days`;
  return { from: ymd(from), to: ymd(to), label };
}

/**
 * The CRM-wide lead date range, shared by the Super Admin dashboard and every pipeline page (MPF, RMW, CT, CTMPL…).
 * Kept for the browser session, so picking "November" on one page applies everywhere.
 * Defaults to this month; there is no all-time option, so old leads never show.
 */
const RANGE_KEY = 'crm.leadsRange';
const RANGE_EVENT = 'crm:leads-range';
export const ALL_RANGE = { preset: 'all', from: '', to: '' };
/** Default for the whole CRM: this month (the filter window, November). */
export const defaultRange = () => ({ preset: 'month', ...RANGE_PRESETS.month.get() });
const readRange = () => {
  try {
    const v = JSON.parse(sessionStorage.getItem(RANGE_KEY));
    // Presets are recomputed so "Today" stays today; custom ranges are kept as picked.
    if (v?.preset && RANGE_PRESETS[v.preset]) return { preset: v.preset, ...RANGE_PRESETS[v.preset].get() };
    if (v?.preset === 'custom' && v.from && v.to) return v;
  } catch {}
  return defaultRange();
};
export function useLeadsRange() {
  const [range, setRangeState] = useState(defaultRange);
  useEffect(() => {
    setRangeState(readRange());
    const sync = () => setRangeState(readRange());
    window.addEventListener(RANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(RANGE_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  const setRange = (r) => {
    try { sessionStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch {}
    setRangeState(r);
    window.dispatchEvent(new Event(RANGE_EVENT));
  };
  return [range, setRange];
}

/**
 * Segmented presets + a custom from/to picker. `value` = { preset, from, to }.
 * The highlighted pill glides between options (position and width ease on one curve) instead of jumping.
 */
export function DateRangeFilter({ value, onChange, className, allowAll = false }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const [customOpen, setCustomOpen] = useState(value.preset === 'custom');
  const valid = draft.from && draft.to && draft.from <= draft.to && draft.from >= FILTER_MIN_DATE && draft.to <= filterMaxDate();
  const activeKey = customOpen || value.preset === 'custom' ? 'custom' : value.preset;

  const groupRef = useRef(null);
  const btnRefs = useRef({});
  const [pill, setPill] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const el = btnRefs.current[activeKey];
      if (el) setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro && groupRef.current) ro.observe(groupRef.current);
    return () => ro?.disconnect();
  }, [activeKey, value.from, value.to]);

  const optionCls = (active) => cn('relative z-[1] inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-[12.5px] lg:min-h-0 font-medium transition-colors duration-300',
    active ? 'text-white' : 'text-slate-600 hover:text-slate-900');

  return (
    <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-2', className)}>
      <div ref={groupRef} role="tablist" aria-label="Date range" className="relative flex max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:inline-flex sm:flex-wrap sm:overflow-visible rounded-full border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
        {pill && (
          <span
            aria-hidden
            className="absolute rounded-full bg-primary shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.55)] transition-[left,top,width,height] duration-[380ms] ease-[cubic-bezier(.22,.61,.36,1)]"
            style={pill}
          />
        )}
        {allowAll && (
          <button
            ref={(el) => { btnRefs.current.all = el; }}
            type="button"
            role="tab"
            aria-selected={activeKey === 'all'}
            onClick={() => { setCustomOpen(false); onChange(ALL_RANGE); }}
            className={optionCls(activeKey === 'all')}
          >All time</button>
        )}
        {Object.entries(RANGE_PRESETS).map(([k, p]) => (
          <button
            key={k}
            ref={(el) => { btnRefs.current[k] = el; }}
            type="button"
            role="tab"
            aria-selected={activeKey === k}
            onClick={() => { setCustomOpen(false); onChange({ preset: k, ...p.get() }); }}
            className={optionCls(activeKey === k)}
          >{p.label}</button>
        ))}
        <button
          ref={(el) => { btnRefs.current.custom = el; }}
          type="button"
          role="tab"
          aria-selected={activeKey === 'custom'}
          onClick={() => setCustomOpen((o) => !o)}
          className={optionCls(activeKey === 'custom')}
        ><CalendarDays className="h-3.5 w-3.5" aria-hidden />{value.preset === 'custom' ? rangeLabel(value) : 'Custom'}</button>
      </div>
      {customOpen && (
        <form
          className="crm-fade grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:flex sm:w-auto sm:flex-wrap sm:rounded-full sm:px-2 sm:py-1 shadow-[0_1px_2px_rgb(16_24_40/0.04)]"
          onSubmit={(e) => { e.preventDefault(); if (valid) onChange({ preset: 'custom', ...draft }); }}
        >
          <input type="date" value={draft.from} min={FILTER_MIN_DATE} max={draft.to || filterMaxDate()} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="h-11 min-w-0 rounded-xl border border-slate-200 px-3 text-[16px] sm:h-7 sm:rounded-full sm:text-[12px]" aria-label="From date" />
          <span className="text-[12px] text-slate-400">to</span>
          <input type="date" value={draft.to} min={draft.from || FILTER_MIN_DATE} max={filterMaxDate()} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="h-11 min-w-0 rounded-xl border border-slate-200 px-3 text-[16px] sm:h-7 sm:rounded-full sm:text-[12px]" aria-label="To date" />
          <button type="submit" disabled={!valid} className="col-span-3 h-11 rounded-xl bg-primary px-4 sm:col-span-1 sm:h-7 sm:rounded-full text-[12px] font-semibold text-white hover:bg-[hsl(var(--primary)/0.9)] disabled:opacity-40">Apply</button>
        </form>
      )}
    </div>
  );
}
