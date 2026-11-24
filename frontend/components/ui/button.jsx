import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Colour, border and shadow ease on one curve; buttons never move, scale or bounce.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-200 ease-[cubic-bezier(.22,.61,.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(16_24_40/0.08),0_4px_12px_-4px_hsl(var(--primary)/0.45)] hover:bg-[hsl(var(--primary)/0.9)] hover:shadow-[0_1px_2px_rgb(16_24_40/0.08),0_6px_16px_-6px_hsl(var(--primary)/0.55)]',
        destructive: 'bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgb(16_24_40/0.08),0_4px_12px_-4px_hsl(var(--destructive)/0.4)] hover:bg-[hsl(var(--destructive)/0.9)]',
        outline: 'border border-slate-200 bg-white text-slate-700 shadow-[0_1px_2px_rgb(16_24_40/0.05)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-slate-200/70',
        ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // Heights match the h-8 inputs so toolbars stay aligned. Below lg (touch) everything grows to a
      // comfortable target: 44px default/lg/icon, 36px sm (compact inline actions).
      size: { default: 'h-11 px-4 lg:h-8 lg:px-3', sm: 'h-9 px-3 text-xs lg:h-7 lg:px-2.5', lg: 'h-12 px-5 lg:h-9', icon: 'h-11 w-11 lg:h-8 lg:w-8' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="animate-spin" />}{children}</>)}
    </Comp>
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
