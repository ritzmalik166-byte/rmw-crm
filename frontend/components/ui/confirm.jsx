'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, LogOut, ShieldAlert, Trash2, KeyRound, Send, GitMerge } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * App-wide confirmation modal, replacing the browser's confirm() pop-up.
 *
 *   confirmAction({ title, description, confirmText, tone: 'danger' | 'warning' | 'default', icon }, () => doIt())
 *   const ok = await confirmDialog({ ... })
 *
 * <ConfirmHost /> is mounted once in app/layout.jsx.
 */
let setRequest = null;
const queue = [];

export function confirmDialog(options = {}) {
  return new Promise((resolve) => {
    const req = { ...options, resolve };
    // Let a closing dropdown menu release focus before the modal opens.
    setTimeout(() => { if (setRequest) setRequest(req); else { queue.push(req); } }, 0);
  });
}

export function confirmAction(options, onConfirm) {
  return confirmDialog(options).then((ok) => { if (ok) onConfirm?.(); return ok; });
}

const ICONS = { danger: Trash2, warning: AlertTriangle, default: HelpCircle, logout: LogOut, security: ShieldAlert, key: KeyRound, send: Send, merge: GitMerge };
const TONE = {
  danger: { chip: 'bg-red-50 text-red-600 ring-red-100', glow: 'from-red-100/70', button: 'destructive' },
  warning: { chip: 'bg-amber-50 text-amber-600 ring-amber-100', glow: 'from-amber-100/70', button: 'default' },
  default: { chip: 'bg-[hsl(var(--accent))] text-[hsl(var(--primary))] ring-[hsl(var(--ring)/0.15)]', glow: 'from-[hsl(var(--accent))]', button: 'default' },
};

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const [open, setOpen] = useState(false);
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    setRequest = (r) => { setReq(r); setOpen(true); };
    if (queue.length) setRequest(queue.shift());
    return () => { setRequest = null; };
  }, []);

  const finish = (ok) => {
    req?.resolve(ok);
    setOpen(false);
    setTimeout(() => { setReq(null); if (queue.length && setRequest) setRequest(queue.shift()); }, 150);
  };

  const tone = TONE[req?.tone] ? req.tone : 'default';
  const t = TONE[tone];
  const Icon = ICONS[req?.icon] || ICONS[tone] || HelpCircle;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(false); }}>
      <DialogContent className="max-w-md overflow-hidden" onOpenAutoFocus={(e) => { e.preventDefault(); (tone === 'danger' ? cancelRef : confirmRef).current?.focus(); }}>
        <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', t.glow)} />
        <DialogHeader className="relative flex-row items-start gap-3.5 space-y-0 text-left">
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-4', t.chip)}><Icon className="h-5 w-5" /></span>
          <div className="min-w-0 pt-0.5">
            <DialogTitle>{req?.title || 'Are you sure?'}</DialogTitle>
            {req?.description && <DialogDescription className="mt-1.5 text-[13.5px] leading-relaxed">{req.description}</DialogDescription>}
          </div>
        </DialogHeader>
        <DialogFooter className="relative mt-1">
          <Button ref={cancelRef} variant="outline" onClick={() => finish(false)}>{req?.cancelText || 'Cancel'}</Button>
          <Button ref={confirmRef} variant={t.button} onClick={() => finish(true)}>{req?.confirmText || 'Confirm'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
