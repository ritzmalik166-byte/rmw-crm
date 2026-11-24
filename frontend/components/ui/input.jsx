import * as React from 'react';
import { cn } from '@/lib/utils';
import { Select } from './select';

const base = 'w-full rounded-lg border border-slate-200 bg-[linear-gradient(180deg,hsl(214_30%_98%),#fff)] text-[16px] lg:text-[13px] shadow-[inset_0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow,background] hover:border-slate-300 focus-visible:bg-white placeholder:text-muted-foreground focus-visible:border-[hsl(var(--ring))] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(var(--ring)/0.18)] disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input type={type} className={cn('flex h-11 px-3 py-1 lg:h-8 lg:px-2.5', base, className)} ref={ref} {...props} />
));
Input.displayName = 'Input';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea className={cn('flex min-h-[72px] px-3 py-2', base, className)} ref={ref} {...props} />
));
Textarea.displayName = 'Textarea';

// Select is a custom listbox (styled open list) with the native <select> API; see ./select.jsx.

export { Input, Textarea, Select };
