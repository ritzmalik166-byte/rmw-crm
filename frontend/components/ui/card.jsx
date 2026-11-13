import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef(({ className, ...props }, ref) => <div ref={ref} className={cn('rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]', className)} {...props} />);
Card.displayName = 'Card';
const CardHeader = React.forwardRef(({ className, ...props }, ref) => <div ref={ref} className={cn('flex flex-col space-y-1 border-b border-slate-100 px-4 py-3', className)} {...props} />);
CardHeader.displayName = 'CardHeader';
const CardTitle = React.forwardRef(({ className, ...props }, ref) => <h3 ref={ref} className={cn(`flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-700 leading-none before:h-3.5 before:w-[3px] before:rounded-full before:bg-[hsl(var(--saffron))] before:content-['']`, className)} {...props} />);
CardTitle.displayName = 'CardTitle';
const CardDescription = React.forwardRef(({ className, ...props }, ref) => <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
CardDescription.displayName = 'CardDescription';
const CardContent = React.forwardRef(({ className, ...props }, ref) => <div ref={ref} className={cn('p-4', className)} {...props} />);
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
