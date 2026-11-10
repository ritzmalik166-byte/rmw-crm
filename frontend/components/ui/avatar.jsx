'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Trash2, Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from './dialog';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Crop to a centred square and resize to `size` px, returning a compact JPEG data URL. */
export function resizeImage(file, size = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) { reject(new Error('Choose a PNG, JPEG or WebP image')); return; }
    if (file.size > MAX_SOURCE_BYTES) { reject(new Error('Image must be under 8 MB')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image')); };
    img.src = url;
  });
}

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');

/** Round picture with an initials fallback. */
export function UserAvatar({ src, name, className }) {
  return src
    ? <img src={src} alt={name ? `${name}'s profile picture` : ''} className={cn('h-8 w-8 shrink-0 rounded-full object-cover', className)} />
    : <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600', className)} aria-hidden>{initials(name)}</span>;
}

/**
 * Large avatar with upload / remove controls. Clicking the picture opens a viewer modal where the
 * user can preview a new photo before updating it. `onChange(dataUrl | null)` may return a promise.
 */
export function AvatarUploader({ src, name, onChange, size = 'h-24 w-24 text-2xl' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(null); // null | 'update' | 'remove'
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const pickTarget = useRef('direct'); // 'direct' saves at once, 'modal' previews first

  const run = async (value) => {
    setBusy(value ? 'update' : 'remove');
    try { await onChange(value); return true; } catch { return false; } finally { setBusy(null); }
  };
  const choose = (target) => { pickTarget.current = target; input.current?.click(); };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = await resizeImage(file, 384);
      if (pickTarget.current === 'modal') setPreview(data);
      else await run(data);
    } catch (err) { toast.error(err.message); }
  };
  const closeModal = (v) => { if (busy) return; setOpen(v); if (!v) setPreview(null); };
  const update = async () => { if (await run(preview)) { setPreview(null); setOpen(false); } };
  const remove = async () => { if (await run(null)) { setPreview(null); setOpen(false); } };
  const shown = preview || src;

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => setOpen(true)} className="relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="View profile picture">
        <UserAvatar src={src} name={name} className={cn(size, 'ring-4 ring-white shadow', busy && 'opacity-60')} />
        {busy && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></span>}
      </button>
      <div className="flex flex-col gap-1.5">
        <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => choose('direct')}>
          {busy === 'update' ? <><Loader2 className="animate-spin" />Updating photo…</> : <><Camera />{src ? 'Change photo' : 'Upload photo'}</>}
        </Button>
        {src && <Button type="button" size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={!!busy} onClick={() => run(null)}>
          {busy === 'remove' ? <><Loader2 className="animate-spin" />Removing…</> : <><Trash2 />Remove</>}
        </Button>}
        <p className="text-[11px] text-muted-foreground">PNG, JPEG or WebP. Cropped to a square.</p>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />

      <Dialog open={open} onOpenChange={closeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{preview ? 'Preview new photo' : 'Profile picture'}</DialogTitle>
            <DialogDescription>{preview ? 'Click Update to save this photo.' : name}</DialogDescription>
          </DialogHeader>
          <div className="relative mx-auto">
            {shown
              ? <img src={shown} alt="" className="h-72 w-72 rounded-lg object-cover shadow" />
              : <UserAvatar name={name} className="h-48 w-48 text-5xl" />}
            {busy && <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/50 text-sm font-medium text-white"><Loader2 className="h-7 w-7 animate-spin" />{busy === 'update' ? 'Updating photo…' : 'Removing photo…'}</span>}
          </div>
          <DialogFooter className="sm:justify-between">
            {src && !preview
              ? <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" disabled={!!busy} onClick={remove}><Trash2 />Remove</Button>
              : <span />}
            <div className="flex gap-2">
              {preview
                ? <>
                    <Button type="button" variant="outline" disabled={!!busy} onClick={() => setPreview(null)}>Cancel</Button>
                    <Button type="button" variant="outline" disabled={!!busy} onClick={() => choose('modal')}><Camera />Change</Button>
                    <Button type="button" disabled={!!busy} onClick={update}>{busy === 'update' ? <><Loader2 className="animate-spin" />Updating photo…</> : <><Upload />Update</>}</Button>
                  </>
                : <Button type="button" variant="outline" onClick={() => choose('modal')}><Camera />{src ? 'Change' : 'Upload'}</Button>}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
