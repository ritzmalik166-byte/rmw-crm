import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-x-auto">
    <table ref={ref} className={cn('w-full caption-bottom border-collapse text-[13px]', className)} {...props} />
  </div>
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
const TableCell = React.forwardRef(({ className, ...props }, ref) => <td ref={ref} className={cn('px-2.5 py-1.5 align-middle', className)} {...props} />);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
