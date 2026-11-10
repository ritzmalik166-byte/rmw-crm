/**
 * Page-shaped loading placeholders. Each one mirrors the real page's layout (headings, strips,
 * tables, cards) so content drops into place without the layout jumping.
 */
import { cn } from '@/lib/utils';
import { Skeleton } from './feedback';

const S = Skeleton;
const range = (n) => Array.from({ length: n }, (_, i) => i);
const Box = ({ className, children }) => <div className={cn('rounded border bg-white', className)}>{children}</div>;

/** Section with a header bar, like the app's .panel blocks. */
function PanelSk({ titleW = 'w-36', action = true, children, className }) {
  return (
    <Box className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b bg-slate-50/70 px-3 py-2.5">
        <S className={cn('h-3.5', titleW)} />
        {action && <S className="h-3 w-20" />}
      </div>
      {children}
    </Box>
  );
}

function HeaderSk({ withActions = 0, date = false, border = true }) {
  return (
    <div className={cn('flex flex-col gap-2 pb-3 sm:flex-row sm:items-end sm:justify-between', border && 'border-b')}>
      <div className="space-y-2"><S className="h-5 w-40" /><S className="h-3 w-80 max-w-[70vw]" /></div>
      <div className="flex gap-2">
        {date && <S className="h-3 w-24" />}
        {range(withActions).map((i) => <S key={i} className={cn('h-8', i === withActions - 1 ? 'w-24' : 'w-20')} />)}
      </div>
    </div>
  );
}

/** Labelled numbers in a bordered strip (dashboard "My work", pipeline summary). */
function StripSk({ cols = 6 }) {
  return (
    <Box className="grid grid-cols-2 divide-x sm:grid-cols-3 lg:grid-cols-6">
      {range(cols).map((i) => <div key={i} className="space-y-2 px-3 py-2.5"><S className="h-2.5 w-20" /><S className="h-5 w-12" /></div>)}
    </Box>
  );
}

function RowsSk({ rows = 6, cols = 5, lead = false }) {
  return (
    <div className="divide-y">
      {range(rows).map((r) => (
        <div key={r} className="flex items-center gap-4 px-3 py-3">
          {lead && <S className="h-4 w-4 shrink-0 rounded-sm" />}
          {range(cols).map((c) => (
            <div key={c} className={cn('flex-1 space-y-1.5', c === 0 && 'flex-[1.6]')}>
              <S className={cn('h-3.5', c === 0 ? 'w-3/4' : c % 2 ? 'w-2/3' : 'w-1/2')} />
              {c === 0 && <S className="h-2.5 w-1/3" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TableHeadSk({ cols }) {
  return (
    <div className="flex gap-4 border-b bg-slate-50/70 px-3 py-2">
      {range(cols).map((c) => <S key={c} className={cn('h-2.5 flex-1', c === 0 && 'flex-[1.6]')} />)}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <HeaderSk date />
      <PanelSk titleW="w-32">
        <TableHeadSk cols={8} />
        <div className="divide-y">
          {range(5).map((r) => (
            <div key={r} className={cn('flex items-center gap-4 px-3 py-2.5', r === 4 && 'bg-slate-50')}>
              <div className="flex flex-[1.6] items-center gap-2"><S className="h-5 w-5 rounded" /><S className="h-3.5 w-28" /></div>
              {range(7).map((c) => <div key={c} className="flex flex-1 justify-end"><S className="h-3.5 w-10" /></div>)}
            </div>
          ))}
        </div>
      </PanelSk>
      <div className="space-y-1.5"><S className="h-2.5 w-16" /><StripSk /></div>
      <div className="space-y-1.5"><S className="h-2.5 w-12" /><StripSk /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSk titleW="w-32">
          <div className="divide-y">
            {range(5).map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex-1 space-y-1.5"><S className="h-3.5 w-2/5" /><S className="h-2.5 w-1/4" /></div>
                <div className="flex items-center gap-2"><S className="h-5 w-10" /><S className="h-5 w-16 rounded-full" /><S className="h-2.5 w-14" /></div>
              </div>
            ))}
          </div>
        </PanelSk>
        <PanelSk titleW="w-36" action={false}><TableHeadSk cols={5} /><RowsSk rows={5} cols={5} /></PanelSk>
      </div>
      <PanelSk titleW="w-28" action={false}>
        <div className="divide-y">{range(5).map((i) => <div key={i} className="flex justify-between gap-3 px-3 py-2.5"><S className="h-3.5 w-1/2" /><S className="h-2.5 w-14" /></div>)}</div>
      </PanelSk>
    </div>
  );
}

export function LeadsSkeleton({ tabs = true }) {
  return (
    <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6" aria-busy="true" aria-label="Loading leads">
      {tabs && <div className="flex gap-1 border-b bg-white px-4 pt-2 sm:px-6">{range(5).map((i) => <div key={i} className="flex items-center gap-2 px-3 py-2"><S className="h-4 w-4 rounded" /><S className="h-3 w-20" /><S className="h-3.5 w-6" /></div>)}</div>}
      <div className="space-y-3 px-4 pt-3 sm:px-6">
        <HeaderSk withActions={3} border={false} />
        <StripSk />
        <Box className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-2">
            <div className="flex gap-1 rounded border bg-slate-50 p-0.5">{range(5).map((i) => <S key={i} className="h-6 w-16" />)}</div>
            <S className="h-8 min-w-[220px] flex-1" />
            {range(3).map((i) => <S key={i} className="h-8 w-32" />)}
          </div>
          <TableHeadSk cols={8} />
          <RowsSk rows={10} cols={8} lead />
          <div className="flex items-center justify-between border-t px-3 py-2.5"><S className="h-3 w-32" /><div className="flex gap-2"><S className="h-7 w-7" /><S className="h-7 w-7" /></div></div>
        </Box>
      </div>
    </div>
  );
}

export function LeadDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading lead">
      <Box>
        <div className="flex items-center gap-2 border-b px-3 py-2"><S className="h-3 w-24" /><S className="h-3 w-28" /></div>
        <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2"><S className="h-6 w-56" /><S className="h-5 w-10" /><S className="h-5 w-20 rounded-full" /></div>
            <div className="flex flex-wrap gap-5">{range(4).map((i) => <S key={i} className="h-3 w-32" />)}</div>
          </div>
          <div className="flex gap-2"><S className="h-8 w-44" /><S className="h-8 w-28" /><S className="h-8 w-24" /></div>
        </div>
      </Box>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <PanelSk titleW="w-28" action={false}>
            <div className="grid gap-x-6 gap-y-4 p-3 sm:grid-cols-2">{range(10).map((i) => <div key={i} className="space-y-1.5"><S className="h-2.5 w-20" /><S className="h-3.5 w-3/4" /></div>)}</div>
          </PanelSk>
          <PanelSk titleW="w-24" action={false}>
            <div className="space-y-4 p-3">{range(4).map((i) => <div key={i} className="flex gap-3"><S className="h-7 w-7 shrink-0 rounded-full" /><div className="flex-1 space-y-1.5"><S className="h-3 w-1/3" /><S className="h-3 w-4/5" /></div></div>)}</div>
          </PanelSk>
        </div>
        <div className="space-y-4">
          <PanelSk titleW="w-20" action={false}><div className="space-y-2 p-3"><S className="h-20" /><S className="h-8 w-24" /></div></PanelSk>
          <PanelSk titleW="w-28" action={false}><div className="space-y-2 p-3">{range(3).map((i) => <S key={i} className="h-12" />)}</div></PanelSk>
        </div>
      </div>
    </div>
  );
}

const FieldSk = ({ className }) => <div className={cn('space-y-2', className)}><S className="h-3 w-24" /><S className="h-9" /></div>;
function CardSk({ titleW = 'w-28', desc = true, children }) {
  return (
    <Box className="rounded-lg">
      <div className="space-y-2 border-b px-5 py-4"><S className={cn('h-3.5', titleW)} />{desc && <S className="h-3 w-72 max-w-full" />}</div>
      <div className="p-5">{children}</div>
    </Box>
  );
}

export function SettingsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading settings">
      <div className="mb-5 space-y-2 border-b pb-4"><S className="h-6 w-32" /><S className="h-3.5 w-80 max-w-full" /></div>
      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Box className="overflow-hidden rounded-lg">
          <div className="h-20 bg-slate-200" />
          <div className="-mt-12 space-y-5 p-5">
            <div className="flex items-center gap-4"><S className="h-24 w-24 rounded-full ring-4 ring-white" /><div className="space-y-2"><S className="h-7 w-28" /><S className="h-2.5 w-36" /></div></div>
            <div className="space-y-2"><S className="h-5 w-40" /><S className="h-3 w-24" /></div>
            <div className="space-y-3.5">{range(4).map((i) => <div key={i} className="flex items-center gap-2.5"><S className="h-4 w-4" /><S className={cn('h-3.5', i === 3 ? 'w-32' : 'w-48')} /></div>)}</div>
          </div>
        </Box>
        <div className="space-y-5">
          <CardSk><div className="grid gap-4 sm:grid-cols-2"><FieldSk /><FieldSk /></div><S className="mt-4 h-8 w-16" /></CardSk>
          <CardSk titleW="w-32"><div className="flex items-center justify-between rounded-md border px-4 py-3"><S className="h-4 w-36" /><S className="h-7 w-28" /></div></CardSk>
          <CardSk titleW="w-24" desc={false}><div className="grid gap-4 sm:grid-cols-3"><FieldSk /><FieldSk /><FieldSk /></div><S className="mt-4 h-8 w-36" /></CardSk>
          <CardSk>
            <div className="mb-4 flex items-center justify-between rounded-md border p-3"><div className="flex gap-3"><S className="h-5 w-5" /><div className="space-y-1.5"><S className="h-3.5 w-44" /><S className="h-3 w-72 max-w-[50vw]" /></div></div><S className="h-7 w-16" /></div>
            <div className="divide-y">{range(6).map((i) => <div key={i} className="flex items-center gap-4 py-3"><S className="h-3.5 flex-1" />{range(3).map((j) => <S key={j} className="h-5 w-9 rounded-full" />)}</div>)}</div>
          </CardSk>
        </div>
      </div>
    </div>
  );
}

/** Title + filters + table: follow-ups, notifications, admin lists. */
export function ListSkeleton({ cols = 5 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <HeaderSk withActions={1} />
      <Box className="overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b px-3 py-2.5"><S className="h-8 w-64" /><S className="h-8 w-36" /><S className="h-8 w-36" /></div>
        <TableHeadSk cols={cols} />
        <RowsSk rows={9} cols={cols} />
      </Box>
    </div>
  );
}

/** Admin-style dashboards: stat tiles then two panels. */
export function StatsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <HeaderSk />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{range(4).map((i) => <Box key={i} className="space-y-2.5 p-4"><div className="flex justify-between"><S className="h-3 w-20" /><S className="h-4 w-4" /></div><S className="h-6 w-16" /><S className="h-2.5 w-24" /></Box>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSk><TableHeadSk cols={4} /><RowsSk rows={6} cols={4} /></PanelSk>
        <PanelSk><div className="p-4"><S className="h-56" /></div></PanelSk>
      </div>
    </div>
  );
}

/** Pick the placeholder that matches the page at `path`. */
export function skeletonFor(path = '') {
  const p = path.split('?')[0];
  if (/^\/crm\/dashboard/.test(p)) return <DashboardSkeleton />;
  if (/^\/crm\/settings\/?$/.test(p)) return <SettingsSkeleton />;
  if (/^\/crm\/leads\/[^/]+/.test(p)) return <LeadDetailSkeleton />;
  if (/^\/crm\/pipeline\//.test(p)) return <LeadsSkeleton />;
  if (/^\/crm\/leads\/?$/.test(p)) return <LeadsSkeleton tabs />;
  if (/\/(dashboard|analytics)$/.test(p)) return <StatsSkeleton />;
  return <ListSkeleton />;
}
