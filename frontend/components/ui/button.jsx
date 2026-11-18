import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[linear-gradient(180deg,hsl(var(--primary)/0.86),hsl(var(--primary)))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_1px_2px_rgb(16_24_40/0.12),0_4px_12px_-4px_hsl(var(--primary)/0.45)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_2px_4px_rgb(16_24_40/0.12),0_8px_18px_-6px_hsl(var(--primary)/0.55)] active:translate-y-px active:brightness-95',
        destructive: 'bg-[linear-gradient(180deg,hsl(0_72%_54%),hsl(var(--destructive)))] text-destructive-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_4px_12px_-4px_hsl(0_70%_45%/0.45)] hover:brightness-110 active:translate-y-px',
        outline: 'border border-slate-200/90 bg-[linear-gradient(180deg,#fff,hsl(214_30%_97%))] text-slate-700 shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(16_24_40/0.06)] hover:border-slate-300 hover:text-foreground hover:shadow-[inset_0_1px_0_#fff,0_3px_8px_-2px_rgb(16_24_40/0.12)] active:translate-y-px',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-[hsl(var(--accent))] hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: { default: 'h-8 px-3', sm: 'h-7 px-2.5 text-xs', lg: 'h-9 px-5', icon: 'h-8 w-8' },
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
