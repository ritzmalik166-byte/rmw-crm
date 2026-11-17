'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

/**
 * A caller's width cap (e.g. max-w-md) applies from sm up, so the phone sheet stays full width.
 * The sm: classes are written out literally: Tailwind only generates classes it finds in source,
 * so building "sm:" + cls at runtime produced classes that did not exist (modals went full width).
 */
const SM_MAX_W = {
  'max-w-xs': 'sm:max-w-xs', 'max-w-sm': 'sm:max-w-sm', 'max-w-md': 'sm:max-w-md', 'max-w-lg': 'sm:max-w-lg',
  'max-w-xl': 'sm:max-w-xl', 'max-w-2xl': 'sm:max-w-2xl', 'max-w-3xl': 'sm:max-w-3xl', 'max-w-4xl': 'sm:max-w-4xl',
  'max-w-5xl': 'sm:max-w-5xl', 'max-w-6xl': 'sm:max-w-6xl',
};
function responsiveWidth(className) {
  if (!className) return className;
  return className.split(/\s+/).map((c) => SM_MAX_W[c] || (c.startsWith('max-w-') ? `sm:${c}` : c)).join(' ');
}

const DialogContent = React.forwardRef(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Phones: bottom sheet that slides up. sm+: centred dialog.
        'fixed inset-x-0 bottom-0 z-50 grid max-h-[92dvh] w-full gap-4 overflow-y-auto rounded-t-2xl border bg-background p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-7 shadow-2xl',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300',
        'sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-6 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95',
        responsiveWidth(className),
      )}
      {...props}
    >
      <span aria-hidden className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300 sm:hidden" />
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1 opacity-70 hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }) => <div className={cn('flex flex-col space-y-1.5', className)} {...props} />;
const DialogFooter = ({ className, ...props }) => <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-base font-semibold', className)} {...props} />);
DialogTitle.displayName = 'DialogTitle';
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
