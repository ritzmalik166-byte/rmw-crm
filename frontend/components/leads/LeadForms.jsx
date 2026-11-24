'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useLookups } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { MemberPicker } from '@/components/leads/MemberPicker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Channel a lead belongs to, by source type: client / Meta leads need that channel's permission to be visible. */
const CHANNEL_OF = { LANDING_PAGE: 'client', META_FORM: 'client', META: 'meta' };
const CHANNEL_INFO = { client: { flag: 'can_client', label: 'Client Leads' }, meta: { flag: 'can_meta', label: 'Meta Leads' } };

export function AssignDialog({ open, onOpenChange, leadIds, websiteId, onDone, currentOwner, leadName, sourceTypes = [] }) {
  const { data: lk } = useLookups();
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [grantAccess, setGrantAccess] = useState(true);
  const [serverNeedsAccess, setServerNeedsAccess] = useState(false);
  const target = lk?.users?.find((u) => String(u.id) === String(userId));
  // Channels these leads belong to that the chosen person can't see yet.
  const missing = target ? [...new Set(sourceTypes.map((t) => CHANNEL_OF[t]).filter(Boolean))].filter((c) => !Number(target[CHANNEL_INFO[c].flag])) : [];
  const needsAccess = Boolean(target) && (missing.length > 0 || serverNeedsAccess);
  const channelText = (sep) => (missing.length ? missing.map((c) => CHANNEL_INFO[c].label).join(sep) : 'this lead channel');
  const m = useMutation({
    mutationFn: () => (leadIds.length === 1
      ? api(`/crm/leads/${leadIds[0]}/assign`, { method: 'POST', body: { userId: userId ? Number(userId) : null, reason: reason || null, grantAccess: needsAccess && grantAccess } })
      : api('/crm/leads/bulk', { method: 'POST', body: { ids: leadIds, action: 'assign', userId: userId ? Number(userId) : null, reason: reason || null, grantAccess: needsAccess && grantAccess } })),
    onSuccess: (r) => {
      if (r?.failed?.length) toast.warning(`${r.updated} updated, ${r.failed.length} failed`, { description: r.failed[0].message });
      else toast.success(currentOwner ? 'Lead transferred' : 'Assignment updated');
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead'] });
      qc.invalidateQueries({ queryKey: ['lookups'] });
      if (needsAccess && grantAccess) toast.success(`${target?.full_name || 'They'} can now see ${channelText(' and ')}`);
      onOpenChange(false); onDone?.();
    },
    onError: (e) => {
      if (e?.errorCode === 'CHANNEL_ACCESS_REQUIRED') setServerNeedsAccess(true);
      toast.error(apiMessage(e));
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leadIds.length > 1 ? `Assign ${leadIds.length} leads` : currentOwner ? 'Transfer lead' : 'Assign lead'}</DialogTitle>
          <DialogDescription>
            {currentOwner ? <>Move {leadName ? <b>{leadName}</b> : 'this lead'} from <b>{currentOwner.name}</b> to another team member. </> : null}
            Only users with access to the lead&apos;s website can be assigned.
          </DialogDescription>
        </DialogHeader>
        <Field label={currentOwner ? 'Transfer to' : 'Assign to'}>
          <MemberPicker
            users={(lk?.users || []).filter((u) => u.id !== currentOwner?.id)} value={userId} onChange={(v) => { setUserId(v); setServerNeedsAccess(false); setGrantAccess(true); }}
            placeholder={currentOwner ? 'Select a team member…' : 'Unassigned'} allowNone={!currentOwner}
          />
        </Field>
        {needsAccess && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950">
            <p className="font-medium">{target.full_name} can&apos;t see {channelText(' or ')} yet.</p>
            <p className="mt-0.5 text-amber-800">Without access they won&apos;t find this lead in their lists.</p>
            <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 font-medium lg:min-h-0">
              <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={grantAccess} onChange={(e) => setGrantAccess(e.target.checked)} />
              Give {target.full_name} access to {channelText(' and ')}
            </label>
          </div>
        )}
        {userId && (
          <Field label="Remark for the assignee (optional)" hint="Shown to them with the assignment. They'll be asked to acknowledge it; if they don't within 10 minutes, they get a reminder and you get notified.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="e.g. Hot lead, call before 5 pm. Interested in 3 BHK." />
          </Field>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={m.isPending} disabled={(Boolean(currentOwner) && !userId) || (needsAccess && !grantAccess)} onClick={() => m.mutate()}>{currentOwner ? 'Transfer' : 'Save'}</Button>
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
          <Field label="Phone"><Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
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
