'use client';
import { useEffect, useRef, useState } from 'react';
import { useIsMutating, useMutationState } from '@tanstack/react-query';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_VISIBLE_MS = 400; // a save never flashes by: the loader stays up at least this long
const RESULT_MS = 1500; // then shows "Saved" / "Couldn't save" briefly

/**
 * App-wide feedback for changes. Whenever any react-query mutation runs (status change, assign, save settings…)
 * a small status chip shows "Saving…", then "Saved" or "Couldn't save". `navigating` drives a thin top progress bar.
 */
export function ActivityLoader({ navigating = false }) {
  const mutating = useIsMutating();
  const statuses = useMutationState({ select: (m) => m.state.status });
  const [phase, setPhase] = useState('idle'); // idle | saving | saved | error
  const startedAt = useRef(0);
  const timer = useRef(null);
  const lastStatus = statuses[statuses.length - 1];

  useEffect(() => {
    clearTimeout(timer.current);
    if (mutating > 0) {
      if (phase !== 'saving') { startedAt.current = Date.now(); setPhase('saving'); }
      return undefined;
    }
    if (phase !== 'saving') return undefined;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    timer.current = setTimeout(() => {
      setPhase(lastStatus === 'error' ? 'error' : 'saved');
      timer.current = setTimeout(() => setPhase('idle'), RESULT_MS);
    }, wait);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutating]);

  const beam = phase === 'saving' || navigating;
  return (
    <>
      <div aria-hidden className={cn('pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px] overflow-hidden transition-opacity duration-200', beam ? 'opacity-100' : 'opacity-0')}>
        <div className="crm-beam h-full w-1/3" />
      </div>

      <div role="status" aria-live="polite"
        className={cn('pointer-events-none fixed right-4 z-[70] transition-opacity duration-200',
          'bottom-[calc(max(env(safe-area-inset-bottom),14px)+84px)] lg:bottom-6 lg:right-6',
          phase === 'idle' ? 'opacity-0' : 'opacity-100')}>
        <div className={cn('flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-700 shadow-sm',
          phase === 'error' && 'border-red-200 bg-red-50 text-red-700')}>
          {phase === 'saving' && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          {phase === 'saved' && <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />}
          {phase === 'error' && <X className="h-4 w-4" strokeWidth={2.5} />}
          <span className="whitespace-nowrap">{phase === 'saving' ? 'Saving…' : phase === 'error' ? 'Couldn’t save' : 'Saved'}</span>
        </div>
      </div>
    </>
  );
}
