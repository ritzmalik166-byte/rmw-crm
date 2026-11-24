'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, UserX } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Searchable team-member picker (replaces the native <select> in Assign / Transfer).
 * Keyboard: ↑ ↓ to move, Enter to pick, Esc to close. `allowNone` adds an "Unassigned" row.
 */
export function MemberPicker({ users = [], value, onChange, placeholder = 'Select a team member…', allowNone = false, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const root = useRef(null);
  const list = useRef(null);
  const selected = users.find((u) => String(u.id) === String(value));

  const options = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = t ? users.filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(t)) : users;
    return allowNone && !t ? [{ id: '', full_name: 'Unassigned', none: true }, ...rows] : rows;
  }, [users, q, allowNone]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => { setHi(0); }, [q, open]);
  useEffect(() => { list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  useEffect(() => { if (autoFocus) setOpen(true); }, [autoFocus]);

  const pick = (u) => { onChange(u.none ? '' : String(u.id)); setOpen(false); setQ(''); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[hi]) pick(options[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cn('flex h-11 w-full items-center gap-2.5 rounded-xl border bg-white px-3 text-left text-[14px] shadow-[0_1px_2px_rgb(16_24_40/0.05)] outline-none transition',
          open ? 'border-primary ring-4 ring-[hsl(var(--primary)/0.12)]' : 'border-slate-200 hover:border-slate-300')}
      >
        {selected ? (
          <>
            <UserAvatar name={selected.full_name} src={selected.avatar_url} className="h-7 w-7 text-[11px]" />
            <span className="min-w-0 flex-1 truncate"><span className="font-medium text-slate-900">{selected.full_name}</span> <span className="text-slate-400">· {selected.email}</span></span>
          </>
        ) : (
          <span className="flex-1 text-slate-400">{placeholder}</span>
        )}
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_-12px_rgb(16_24_40/0.25)]">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Search by name or email" aria-label="Search team members"
              className="h-10 w-full bg-transparent text-[14px] outline-none placeholder:text-slate-400"
            />
          </div>
          <ul ref={list} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {options.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-slate-500">No team member matches “{q}”.</li>}
            {options.map((u, i) => {
              const isSel = u.none ? !value : String(u.id) === String(value);
              return (
                <li
                  key={u.id || 'none'} data-i={i} role="option" aria-selected={isSel}
                  onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(u)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2', i === hi ? 'bg-slate-100' : '')}
                >
                  {u.none
                    ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserX className="h-4 w-4" /></span>
                    : <UserAvatar name={u.full_name} src={u.avatar_url} className="h-8 w-8 text-[11px]" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-slate-900">{u.full_name}</span>
                    {!u.none && <span className="block truncate text-[12px] text-slate-500">{u.email}</span>}
                  </span>
                  {isSel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
