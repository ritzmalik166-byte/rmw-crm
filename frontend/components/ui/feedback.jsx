import { AlertTriangle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />;
}

/** Generic page-content placeholder: title, stat tiles, then a table block. */
export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="rounded-lg border bg-white">
        <div className="border-b px-3 py-3"><Skeleton className="h-4 w-40" /></div>
        <TableSkeleton rows={7} cols={5} />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="divide-y">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-3 py-3">
          {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <Icon className="mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-amber-500" />
      <p className="text-sm font-medium">Could not load this data</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error?.message || 'Something went wrong'}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  return (
    <div className="flex items-center justify-between border-t px-3 py-2.5 text-sm text-muted-foreground">
      <span>{from}–{to} of {meta.total.toLocaleString('en-IN')}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="px-2">Page {meta.page} of {meta.totalPages}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:mb-3 sm:flex-row sm:items-end sm:justify-between sm:gap-2 sm:pb-3">
      <div>
        <h1 className="text-[17px] font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 [&>*]:h-10 [&>*]:flex-1 sm:[&>*]:h-8 sm:[&>*]:flex-none">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone, logo }) {
  return (
    <div className="gloss gloss-hover relative overflow-hidden rounded-2xl px-4 py-3">
      <span aria-hidden className={cn('pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full opacity-60 blur-2xl', tone === 'danger' ? 'bg-red-200' : tone === 'warning' ? 'bg-amber-200' : tone === 'success' ? 'bg-emerald-200' : 'bg-[hsl(var(--accent))]')} />
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[hsl(var(--primary))] via-[hsl(var(--ring))] to-[hsl(var(--saffron))] opacity-80" />
      <div className="relative flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{logo && <img src={logo} alt="" aria-hidden className="h-4 w-4 object-contain" />}{label}</p>
        {Icon && <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-b from-white to-slate-100 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(16_24_40/0.08)] ring-1 ring-slate-200/70', tone === 'danger' && 'text-red-500', tone === 'warning' && 'text-amber-500', tone === 'success' && 'text-emerald-600', !tone && 'text-[hsl(var(--primary))]')}><Icon className="h-3.5 w-3.5" /></span>}
      </div>
      <p className="relative mt-1.5 text-[22px] font-semibold tabular-nums tracking-tight text-slate-900">{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
