'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that glides to its new value (ease-out, ~600ms) instead of jumping when the date range or live data
 * changes. Renders the final value on the server and for reduced-motion users.
 */
export function AnimatedNumber({ value = 0, className, format = (n) => n.toLocaleString('en-IN') }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion() || from.current === target) { from.current = target; setShown(target); return undefined; }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target]);
  return <span className={cn('tabular-nums', className)}>{format(shown)}</span>;
}

/** Smooth (Catmull-Rom → Bézier) path through the points. */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/**
 * Small trend line drawn from real daily values. The line draws itself in once, and later data changes morph
 * smoothly via CSS `d` transitions where the browser supports them. Renders nothing without data.
 */
export function Sparkline({ data, color = '#2563eb', className, label }) {
  const id = useId().replace(/:/g, '');
  const pathRef = useRef(null);
  const [len, setLen] = useState(0);
  const values = (data || []).map((v) => Number(v) || 0);
  const W = 84;
  const H = 30;
  const pad = 3;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / Math.max(values.length - 1, 1), H - pad - (v / max) * (H - pad * 2)]);
  const d = smoothPath(pts);
  useEffect(() => { if (pathRef.current) setLen(pathRef.current.getTotalLength()); }, [d]);
  if (values.length < 2) return null;
  const area = `${d} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('h-[30px] w-[84px] overflow-visible', className)} role="img" aria-label={label || `Trend over the last ${values.length} days`}>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.16" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg${id})`} className="transition-[d,opacity] duration-700 ease-[cubic-bezier(.22,.61,.36,1)]" />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-[d] duration-700 ease-[cubic-bezier(.22,.61,.36,1)]"
        style={len ? { strokeDasharray: len, strokeDashoffset: 0, animation: `crm-draw 1s cubic-bezier(.22,.61,.36,1) backwards` , '--len': len } : { opacity: 0 }}
      />
    </svg>
  );
}

/** "↑ 12% vs yesterday" — computed from real current vs previous-period values. */
export function Delta({ current, previous, compareLabel, goodWhenUp = true }) {
  const cur = Number(current) || 0;
  const prev = Number(previous);
  if (!Number.isFinite(prev)) return <span className="text-[11.5px] text-slate-400">&nbsp;</span>;
  let pct;
  if (prev === 0) pct = cur === 0 ? 0 : null; // null = new from zero, no meaningful %
  else pct = Math.round(((cur - prev) / prev) * 100);
  const up = cur > prev;
  const flat = cur === prev;
  const good = flat ? null : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={cn('inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums',
        good === null ? 'text-slate-500' : good ? 'text-emerald-600' : 'text-red-600')}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        {pct === null ? `+${cur}` : `${Math.abs(pct)}%`}
      </span>
      <span className="text-[11px] text-slate-400">vs {compareLabel}</span>
    </span>
  );
}

export const KPI_TONES = {
  blue: { top: 'bg-blue-600', chip: 'bg-blue-50 text-blue-600', line: '#2563eb' },
  sky: { top: 'bg-sky-500', chip: 'bg-sky-50 text-sky-600', line: '#0ea5e9' },
  indigo: { top: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-600', line: '#6366f1' },
  amber: { top: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600', line: '#f59e0b' },
  red: { top: 'bg-red-500', chip: 'bg-red-50 text-red-600', line: '#ef4444' },
  green: { top: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-600', line: '#10b981' },
  slate: { top: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600', line: '#64748b' },
};

/**
 * Metric card: coloured top rule, label + icon chip, big number, optional change vs the previous period and a
 * 7-day sparkline. Becomes a link when `href` is given (hover deepens border/shadow; nothing moves).
 */
export function KpiCard({ label, value, icon: Icon, tone = 'blue', href, delta, trend, trendLabel, className }) {
  const t = KPI_TONES[tone] || KPI_TONES.blue;
  const body = (
    <>
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', t.top)} />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words pt-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
        {Icon && <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', t.chip)}><Icon className="h-4 w-4" strokeWidth={2} aria-hidden /></span>}
      </div>
      <AnimatedNumber value={value} className="mt-1 block truncate text-[24px] font-semibold sm:text-[28px] leading-none tracking-tight text-slate-900" />
      {(delta || trend) && (
        <div className="mt-3 flex min-h-[30px] items-end justify-between gap-2">
          {delta || <span />}
          {trend && <Sparkline data={trend} color={t.line} label={trendLabel} />}
        </div>
      )}
    </>
  );
  const cls = cn('gloss relative block min-w-0 overflow-hidden rounded-2xl px-3.5 pb-3.5 pt-3.5 sm:px-4 sm:pb-4 sm:pt-4', className);
  return href
    ? <Link href={href} className={cn(cls, 'gloss-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Small ⓘ next to a column heading; the explanation shows as a native tooltip and to screen readers. */
export function InfoTip({ text }) {
  return (
    <span className="inline-flex align-middle text-slate-400" title={text}>
      <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
