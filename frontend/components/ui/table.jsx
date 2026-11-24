import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Table: always scrolls horizontally inside its own wrapper (never the page).
 * Opt-in props (all backward compatible):
 *   <Table stickyFirstColumn>   first column stays pinned while the table scrolls sideways.
 *   <Table wrapperClassName="…"> extra classes for the scroll wrapper.
 *   <Table mobileCards={<MobileCardList …/>}> below md the table is hidden and the given node is shown instead.
 * Helper: <MobileCardList items={rows} getKey={(r)=>r.id} renderCard={(r)=>…} onItemClick={(r)=>…} empty="No rows" />
 *   renders a simple stacked card list for phones; use it standalone or via `mobileCards`.
 */
const Table = React.forwardRef(({ className, stickyFirstColumn = false, wrapperClassName, mobileCards, ...props }, ref) => (
  <>
    <div className={cn('relative w-full max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]', mobileCards && 'hidden md:block', wrapperClassName)}>
      <table
        ref={ref}
        className={cn('w-full caption-bottom border-collapse text-[13px]',
          stickyFirstColumn && '[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-[1] [&_td:first-child]:bg-white [&_th:first-child]:bg-slate-50 [&_tr>*:first-child]:shadow-[1px_0_0_rgb(226_232_240)]',
          className)}
        {...props}
      />
    </div>
    {mobileCards && <div className="md:hidden">{mobileCards}</div>}
  </>
));
Table.displayName = 'Table';
const TableHeader = React.forwardRef(({ className, ...props }, ref) => <thead ref={ref} className={cn('sticky top-0 z-[1] bg-gradient-to-b from-slate-50 to-[hsl(214_28%_95%)] backdrop-blur [&_tr]:border-b', className)} {...props} />);
TableHeader.displayName = 'TableHeader';
const TableBody = React.forwardRef(({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />);
TableBody.displayName = 'TableBody';
const TableRow = React.forwardRef(({ className, ...props }, ref) => <tr ref={ref} className={cn('border-b border-slate-200/80 transition-colors hover:bg-[linear-gradient(90deg,hsl(var(--accent)),hsl(var(--accent)/0.4))] data-[state=selected]:bg-[hsl(var(--accent))]', className)} {...props} />);
TableRow.displayName = 'TableRow';
const TableHead = React.forwardRef(({ className, ...props }, ref) => <th ref={ref} className={cn('h-8 whitespace-nowrap px-2.5 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-600', className)} {...props} />);
TableHead.displayName = 'TableHead';
const TableCell = React.forwardRef(({ className, ...props }, ref) => <td ref={ref} className={cn('px-2.5 py-2.5 align-middle lg:py-1.5', className)} {...props} />);
TableCell.displayName = 'TableCell';

function MobileCardList({ items = [], getKey = (_, i) => i, renderCard, onItemClick, empty = 'Nothing to show', className }) {
  if (!items.length) return <p className="px-4 py-10 text-center text-[13px] text-slate-500">{empty}</p>;
  return (
    <ul className={cn('divide-y divide-slate-100', className)}>
      {items.map((item, i) => (
        <li key={getKey(item, i)}>
          {onItemClick
            ? <button type="button" onClick={() => onItemClick(item)} className="block w-full px-4 py-3 text-left active:bg-slate-50">{renderCard(item, i)}</button>
            : <div className="px-4 py-3">{renderCard(item, i)}</div>}
        </li>
      ))}
    </ul>
  );
}

export { MobileCardList, Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
