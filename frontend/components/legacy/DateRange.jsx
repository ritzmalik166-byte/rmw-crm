'use client';
import { useState } from 'react';
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
  if (r.preset !== 'custom') return RANGE_PRESETS[r.preset].label;
  const f = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return r.from === r.to ? f(r.from) : `${f(r.from)} – ${f(r.to)}`;
}

export const todayRange = () => ({ preset: 'today', ...RANGE_PRESETS.today.get() });

/** Segmented presets + a custom from/to picker. `value` = { preset, from, to }. */
export function DateRangeFilter({ value, onChange, className }) {
  const [draft, setDraft] = useState({ from: value.from, to: value.to });
  const [customOpen, setCustomOpen] = useState(value.preset === 'custom');
  const valid = draft.from && draft.to && draft.from <= draft.to && draft.from >= FILTER_MIN_DATE && draft.to <= filterMaxDate();

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {Object.entries(RANGE_PRESETS).map(([k, p]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setCustomOpen(false); onChange({ preset: k, ...p.get() }); }}
            className={cn('rounded-lg px-2.5 py-1 text-[12px] font-medium transition', value.preset === k ? 'bg-[hsl(213_70%_96%)] text-[hsl(var(--primary))] shadow-[inset_0_0_0_1px_hsl(213_60%_86%)]' : 'text-slate-600 hover:bg-slate-50')}
          >{p.label}</button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((o) => !o)}
          className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium transition', value.preset === 'custom' || customOpen ? 'bg-[hsl(213_70%_96%)] text-[hsl(var(--primary))] shadow-[inset_0_0_0_1px_hsl(213_60%_86%)]' : 'text-slate-600 hover:bg-slate-50')}
        ><CalendarDays className="h-3.5 w-3.5" />{value.preset === 'custom' ? rangeLabel(value) : 'Custom'}</button>
      </div>
      {customOpen && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm"
          onSubmit={(e) => { e.preventDefault(); if (valid) onChange({ preset: 'custom', ...draft }); }}
        >
          <input type="date" value={draft.from} min={FILTER_MIN_DATE} max={draft.to || filterMaxDate()} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} className="h-7 rounded-md border border-slate-200 px-2 text-[12px]" aria-label="From date" />
          <span className="text-[12px] text-slate-400">to</span>
          <input type="date" value={draft.to} min={draft.from || FILTER_MIN_DATE} max={filterMaxDate()} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} className="h-7 rounded-md border border-slate-200 px-2 text-[12px]" aria-label="To date" />
          <button type="submit" disabled={!valid} className="h-7 rounded-md bg-[hsl(var(--primary))] px-3 text-[12px] font-semibold text-white disabled:opacity-40">Apply</button>
        </form>
      )}
    </div>
  );
}
