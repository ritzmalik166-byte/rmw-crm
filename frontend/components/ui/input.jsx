import * as React from 'react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-lg border border-input bg-white text-[13px] shadow-[inset_0_1px_1px_rgba(16,24,40,0.03)] transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-[hsl(var(--ring))] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[hsl(213_70%_55%/0.18)] disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input type={type} className={cn('flex h-8 px-2.5 py-1', base, className)} ref={ref} {...props} />
));
Input.displayName = 'Input';

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea className={cn('flex min-h-[72px] px-3 py-2', base, className)} ref={ref} {...props} />
));
Textarea.displayName = 'Textarea';

const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn('flex h-8 px-2 py-1', base, className)} {...props}>{children}</select>
));
Select.displayName = 'Select';

export { Input, Textarea, Select };
