'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** "2 min 10 s" style duration. */
export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/**
 * Progress + time left, from the live stats the sync writes every ~2s.
 * Time left = elapsed × (forms remaining / forms done); shown once there is enough signal to be useful.
 */
export function syncEstimate(stats, now = Date.now()) {
  if (!stats?.startedAt) return { pct: null, elapsed: null, left: null };
  const elapsed = now - new Date(stats.startedAt).getTime();
  if (stats.phase === 'forms' || !stats.forms) return { pct: null, elapsed, left: null };
  if (stats.phase === 'spend') return { pct: 98, elapsed, left: null };
  const frac = Math.min(1, (stats.formsDone || 0) / stats.forms);
  const left = frac >= 0.02 && elapsed > 4000 ? (elapsed * (1 - frac)) / frac : null;
  return { pct: Math.max(2, Math.round(frac * 100)), elapsed, left };
}

const PHASE = { forms: 'Reading lead forms from Meta…', leads: 'Importing leads', spend: 'Updating campaign spend…' };

export function SyncProgress({ stats, className }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const live = stats?.inProgress ? stats : null;
  const { pct, elapsed, left } = syncEstimate(live, now);
  const indeterminate = pct == null;

  return (
    <div className={cn('space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3', className)} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[12.5px]">
        <span className="flex min-w-0 items-center gap-1.5 font-medium text-blue-950">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
          <span className="truncate">{PHASE[live?.phase] || 'Syncing…'}</span>
        </span>
        {!indeterminate && <span className="shrink-0 font-semibold tabular-nums text-blue-900">{pct}%</span>}
      </div>

      <div className="relative h-2 overflow-hidden rounded-full bg-blue-100">
        {indeterminate ? (
          <div className="absolute inset-y-0 w-1/3 animate-[sync-slide_1.2s_ease-in-out_infinite] rounded-full bg-blue-500" />
        ) : (
          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }}>
            <div className="h-full w-full animate-pulse bg-white/20" />
          </div>
        )}
      </div>

      {live && (
        <div className="space-y-0.5 text-[12px] text-blue-900/80">
          {live.phase === 'leads' && live.forms > 0 && (
            <p className="truncate">Form {Math.min(live.formsDone + 1, live.forms)} of {live.forms}{live.currentForm ? ` · ${live.currentForm}` : ''}</p>
          )}
          <p className="tabular-nums">Imported {live.imported} · Already in CRM {live.duplicatesSkipped}{live.errors ? ` · Errors ${live.errors}` : ''}</p>
          <p className="tabular-nums">
            {left != null ? <b className="text-blue-950">About {fmtDuration(left)} left</b> : <span>Estimating time left…</span>}
            {elapsed != null && <span> · running {fmtDuration(elapsed)}</span>}
          </p>
        </div>
      )}
      <style>{'@keyframes sync-slide{0%{left:-33%}100%{left:100%}}'}</style>
    </div>
  );
}
