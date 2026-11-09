import { AlertTriangle, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
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
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn('h-4 w-4 text-muted-foreground', tone === 'danger' && 'text-red-500', tone === 'warning' && 'text-amber-500', tone === 'success' && 'text-emerald-600')} />}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
