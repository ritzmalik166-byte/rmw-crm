import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Meta infinity mark with an Instagram badge (Facebook + Instagram lead ads). Inline SVG, no external assets. */
export function MetaLogo({ className, badge = true, tile = true }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className={cn('relative inline-flex h-10 w-10 shrink-0 items-center justify-center', tile && 'rounded-xl bg-white shadow-sm ring-1 ring-slate-200', className)}>
      <svg viewBox="0 0 36 24" className="h-[58%] w-[70%]" aria-hidden>
        <defs>
          <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0064E0" />
            <stop offset="0.55" stopColor="#0082FB" />
            <stop offset="1" stopColor="#00A3FF" />
          </linearGradient>
        </defs>
        <path
          fill="none" stroke={`url(#m${id})`} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"
          d="M4 15.5C4 9.5 6.6 4.5 10.2 4.5c3 0 5 3.3 7.8 8.2 2.9 5 4.9 7.8 7.7 7.8 2.7 0 4.3-2.6 4.3-6.2 0-5.4-2.4-9.8-5.9-9.8-2.9 0-5 3.1-7.8 7.9-2.8 4.9-4.6 8.1-7.6 8.1C5.8 20.5 4 18.6 4 15.5z"
        />
      </svg>
      {badge && (
        <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-[6px] ring-2 ring-white"
          style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden>
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.3" cy="6.7" r="0.6" fill="#fff" stroke="none" />
          </svg>
        </span>
      )}
    </span>
  );
}
