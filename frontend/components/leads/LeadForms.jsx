'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AssignDialog({ open, onOpenChange, leadIds, websiteId, onDone }) {
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => (leadIds.length === 1
      ? api(`/crm/leads/${leadIds[0]}/assign`, { method: 'POST', body: { userId: userId ? Number(userId) : null, reason: reason || null } })
      : api('/crm/leads/bulk', { method: 'POST', body: { ids: leadIds, action: 'assign', userId: userId ? Number(userId) : null } })),
    onSuccess: (r) => {
      if (r?.failed?.length) toast.warning(`${r.updated} updated, ${r.failed.length} failed`, { description: r.failed[0].message });
      else toast.success('Assignment updated');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
      onOpenChange(false); onDone?.();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leadIds.length > 1 ? `Assign ${leadIds.length} leads` : 'Assign lead'}</DialogTitle>
          <DialogDescription>Only users with access to the lead&apos;s website can be assigned.</DialogDescription>
        </DialogHeader>
        <Field label="Assign to">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Unassigned</option>
            {lk?.users?.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
          </Select>
        </Field>
        {leadIds.length === 1 && <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={255} /></Field>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkStatusDialog({ open, onOpenChange, leadIds, onDone }) {
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const [statusId, setStatusId] = useState('');
  const m = useMutation({
    mutationFn: () => api('/crm/leads/bulk', { method: 'POST', body: { ids: leadIds, action: 'status', statusId: Number(statusId) } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} lead(s) updated${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
      qc.invalidateQueries({ queryKey: ['leads'] });
      onOpenChange(false); onDone?.();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Change status of {leadIds.length} lead(s)</DialogTitle></DialogHeader>
        <Field label="New status">
          <Select value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            <option value="">Select…</option>
            {lk?.statuses?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!statusId} loading={m.isPending} onClick={() => m.mutate()}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyLead = { websiteId: '', name: '', phone: '', email: '', location: '', interest: '', message: '', source: '', campaign: '' };

export function CreateLeadDialog({ open, onOpenChange }) {
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const [f, setF] = useState(emptyLead);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => api('/crm/leads', { method: 'POST', body: { ...f, websiteId: Number(f.websiteId) } }),
    onSuccess: () => { toast.success('Lead created'); qc.invalidateQueries({ queryKey: ['leads'] }); setF(emptyLead); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add lead manually</DialogTitle><DialogDescription>For walk-ins, calls and other offline enquiries.</DialogDescription></DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Website" className="sm:col-span-2">
            <Select value={f.websiteId} onChange={set('websiteId')} required>
              <option value="">Select…</option>
              {lk?.websites?.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
            </Select>
          </Field>
          <Field label="Name"><Input value={f.name} onChange={set('name')} required /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Interest" className="sm:col-span-2"><Input value={f.interest} onChange={set('interest')} /></Field>
          <Field label="Source"><Input value={f.source} onChange={set('source')} placeholder="manual" /></Field>
          <Field label="Campaign"><Input value={f.campaign} onChange={set('campaign')} /></Field>
          <Field label="Message" className="sm:col-span-2"><Textarea value={f.message} onChange={set('message')} /></Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={m.isPending}>Create lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
