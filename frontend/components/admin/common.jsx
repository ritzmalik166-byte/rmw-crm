'use client';
import { useState } from 'react';
import { UserAvatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Checkbox } from '@/components/ui/controls';

export function useOrg() {
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles'), staleTime: 60_000 });
  const departments = useQuery({ queryKey: ['admin', 'departments'], queryFn: () => api('/admin/departments'), staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), staleTime: 60_000 });
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), staleTime: 60_000 });
  return { roles: roles.data || [], departments: departments.data || [], teams: teams.data || [], websites: websites.data || [] };
}

/**
 * Checkbox list. Shows the first `max` options (selected ones first) and a "+N more" button that opens
 * a searchable modal with the full list. Options may carry `avatar` to show a profile picture.
 */
export function MultiCheck({ options, value, onChange, render, max = 10, title = 'Select people' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const label = (o) => (render ? render(o) : (
    <span className="flex items-center gap-1.5">{'avatar' in o && <UserAvatar src={o.avatar} name={o.name} className="h-6 w-6 text-[10px]" />}{o.name}</span>
  ));
  const sorted = [...options].sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)));
  const shown = sorted.slice(0, max);
  const hidden = options.length - shown.length;
  const filtered = options.filter((o) => o.name?.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
      {shown.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm"><Checkbox checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} />{label(o)}</label>
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
          +{hidden} more
        </button>
      )}
      {!options.length && <span className="text-sm text-muted-foreground">None available</span>}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
          <Input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <p className="text-xs text-muted-foreground">{value.length} of {options.length} selected</p>
          <ul className="max-h-80 divide-y overflow-y-auto rounded border">
            {filtered.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60">
                  <Checkbox checked={value.includes(o.id)} onCheckedChange={() => toggle(o.id)} />{label(o)}
                </label>
              </li>
            ))}
            {!filtered.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</li>}
          </ul>
          <DialogFooter><Button onClick={() => setOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const WEBSITE_COLORS = { MPF: '#2a78d6', RMW: '#eb6834', CT: '#1baf7a' };
