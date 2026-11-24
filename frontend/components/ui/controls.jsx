'use client';
import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn('peer relative h-5 w-5 shrink-0 rounded-[5px] border border-primary shadow lg:h-4 lg:w-4 lg:rounded-sm before:absolute before:-inset-3 lg:before:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current"><Check className="h-3.5 w-3.5" /></CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn('peer relative inline-flex h-6 w-11 shrink-0 lg:h-5 lg:w-9 before:absolute before:-inset-2.5 lg:before:hidden cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input', className)}
    {...props}
  >
    <SwitchPrimitives.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 lg:h-4 lg:w-4 lg:data-[state=checked]:translate-x-4" />
  </SwitchPrimitives.Root>
));
Switch.displayName = 'Switch';

// min-w-0 + max-w-full keep the tab row inside its parent, so a long TabsList scrolls instead of overflowing the page.
export const Tabs = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Root ref={ref} className={cn('min-w-0 max-w-full', className)} {...props} />
));
Tabs.displayName = 'Tabs';
export const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('inline-flex h-12 max-w-full items-center lg:h-10 justify-start gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-xl border border-slate-200/80 bg-white p-1 text-slate-500 shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...props} />
));
TabsList.displayName = 'TabsList';
export const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn('group inline-flex h-10 shrink-0 lg:h-8 items-center justify-center whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all hover:bg-slate-50 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[hsl(213_70%_96%)] data-[state=active]:text-[hsl(var(--primary))] data-[state=active]:shadow-[inset_0_0_0_1px_hsl(213_60%_86%)]', className)} {...props} />
));
TabsTrigger.displayName = 'TabsTrigger';
export const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-3 focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn('z-50 min-w-[10rem] max-w-[calc(100vw-16px)] max-h-[min(var(--radix-dropdown-menu-content-available-height,70vh),70dvh)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200/80 bg-white p-1 text-popover-foreground shadow-[0_16px_40px_-12px_rgb(16_24_40/0.22),0_2px_6px_rgb(16_24_40/0.06)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-200', className)} {...props} />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';
export const DropdownMenuItem = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item ref={ref} className={cn('relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm lg:px-2 lg:py-1.5 outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4', className)} {...props} />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
export const DropdownMenuLabel = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-sm font-semibold', className)} {...props} />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';
export const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
