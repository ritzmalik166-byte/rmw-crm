'use client';
/**
 * Dialog: bottom sheet on phones (drag-handle, scrollable body, sticky DialogFooter that stays
 * pinned above the home indicator), centred modal from sm up. API unchanged.
 * Opt-in: <DialogFooter sticky={false}> to keep a footer inline on phones.
 */
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
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[3px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Phones: bottom sheet that slides up. sm+: centred dialog.
        'fixed inset-x-0 bottom-0 z-50 grid max-h-[92dvh] w-full max-w-full gap-4 overflow-y-auto overscroll-contain rounded-t-3xl border border-white/70 bg-white/95 p-5 backdrop-blur-xl pb-[calc(env(safe-area-inset-bottom)+20px)] pt-7 shadow-2xl',
        'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300',
        'sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:p-6 sm:shadow-[0_24px_64px_-16px_rgb(16_24_40/0.35)] sm:data-[state=open]:slide-in-from-bottom-2 sm:data-[state=open]:fade-in-0 sm:data-[state=open]:duration-300',
        responsiveWidth(className),
      )}
      {...props}
    >
      <span aria-hidden className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-slate-300 sm:hidden" />
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full opacity-70 sm:right-4 sm:top-4 sm:h-auto sm:w-auto sm:p-1 hover:bg-slate-100 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }) => <div className={cn('flex flex-col space-y-1.5', className)} {...props} />;
const DialogFooter = ({ className, sticky = true, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      // Phones: pinned to the bottom of the sheet while the body scrolls; full-width actions.
      sticky && 'sticky bottom-0 z-[2] -mx-5 -mb-[calc(env(safe-area-inset-bottom)+20px)] border-t border-slate-100 bg-white/95 px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur [&>*]:w-full sm:static sm:z-auto sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none sm:[&>*]:w-auto',
      className,
    )}
    {...props}
  />
);
const DialogTitle = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Title ref={ref} className={cn('text-[17px] font-semibold tracking-tight text-slate-900', className)} {...props} />);
DialogTitle.displayName = 'DialogTitle';
const DialogDescription = React.forwardRef(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };
