'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, MapPin, Target, UserPlus, Pencil, CalendarPlus, CheckCircle2, Copy, GitMerge, Clock } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { formatDateTime, timeAgo, titleCase, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, Skeleton, EmptyState } from '@/components/ui/feedback';
import { AssignDialog } from '@/components/leads/LeadForms';

function Row({ label, value, mono }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('col-span-2 break-words', mono && 'font-mono text-xs')}>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const ACTIVITY_LABELS = {
  LEAD_CREATED: 'Lead created', LEAD_SYNCED: 'Updated from source website', LEAD_ASSIGNED: 'Lead assigned', LEAD_REASSIGNED: 'Lead reassigned',
  STATUS_CHANGED: 'Status changed', LEAD_UPDATED: 'Lead updated', NOTE_ADDED: 'Note added', FOLLOWUP_CREATED: 'Follow-up created',
  FOLLOWUP_COMPLETED: 'Follow-up completed', CONVERTED: 'Converted', LEAD_MERGED: 'Merged',
};

function describeActivity(a) {
  const m = typeof a.meta === 'string' ? JSON.parse(a.meta) : a.meta || {};
  if (a.type === 'STATUS_CHANGED' || a.type === 'CONVERTED') return `${titleCase(m.from)} → ${titleCase(m.to)}`;
  if (a.type === 'LEAD_UPDATED') return m.fields?.join(', ');
  if (a.type === 'LEAD_CREATED') return [m.website, m.externalLeadId, m.source && `via ${m.source}`].filter(Boolean).join(' · ');
  if (a.type === 'FOLLOWUP_CREATED') return m.dueAt && `Due ${formatDateTime(m.dueAt)}`;
  if (a.type === 'LEAD_MERGED') return m.mergedExternalId ? `Merged ${m.mergedExternalId} into this lead` : 'Merged into another lead';
  if (m.reason) return m.reason;
  return null;
}

function EditDialog({ lead, open, onOpenChange }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: lead.name || '', phone: lead.phone || '', email: lead.email || '', location: lead.location || '', interest: lead.interest || '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => api(`/crm/leads/${lead.id}`, { method: 'PATCH', body: { ...f, email: f.email || null } }),
    onSuccess: () => { toast.success('Lead updated'); qc.invalidateQueries({ queryKey: ['lead', String(lead.id)] }); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit lead</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={f.name} onChange={set('name')} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Interest"><Input value={f.interest} onChange={set('interest')} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">The external lead ID and source attribution can&apos;t be edited.</p>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowupForm({ leadId, onDone }) {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [priority, setPriority] = useState('MEDIUM');
  const [notes, setNotes] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/crm/leads/${leadId}/followups`, { method: 'POST', body: { dueAt: new Date(`${date}T${time}`).toISOString(), priority, notes: notes || null } }),
    onSuccess: () => { toast.success('Follow-up scheduled'); qc.invalidateQueries({ queryKey: ['lead', String(leadId)] }); qc.invalidateQueries({ queryKey: ['followups'] }); setNotes(''); setDate(''); onDone?.(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <form className="grid gap-3 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Field label="Date"><Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
      <Field label="Priority">
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
        </Select>
      </Field>
      <div className="flex items-end"><Button type="submit" className="w-full" loading={m.isPending}><CalendarPlus />Schedule</Button></div>
      <Field label="Notes" className="sm:col-span-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should happen on this follow-up?" /></Field>
    </form>
  );
}

export default function LeadDetailPage({ params }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: lk } = useLookups();
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState('');
  const { data: lead, isLoading, isError, error, refetch } = useQuery({ queryKey: ['lead', id], queryFn: () => api(`/crm/leads/${id}`) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['leads'] }); };
  const status = useMutation({
    mutationFn: (statusId) => api(`/crm/leads/${id}`, { method: 'PATCH', body: { statusId: Number(statusId) } }),
    onSuccess: () => { toast.success('Status updated'); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => api(`/crm/leads/${id}/notes`, { method: 'POST', body: { body: note } }),
    onSuccess: () => { setNote(''); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const completeFollowup = useMutation({
    mutationFn: (fid) => api(`/crm/followups/${fid}`, { method: 'PATCH', body: { status: 'COMPLETED' } }),
    onSuccess: () => { toast.success('Follow-up completed'); invalidate(); qc.invalidateQueries({ queryKey: ['followups'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const resolveDup = useMutation({
    mutationFn: ({ dupId, action, primaryLeadId }) => api(`/crm/duplicates/${dupId}/resolve`, { method: 'POST', body: { action, primaryLeadId } }),
    onSuccess: () => { toast.success('Duplicate resolved'); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;

  const a = lead.attribution || {};
  const attrExtra = typeof a.extra === 'string' ? JSON.parse(a.extra || '{}') : a.extra || {};
  const openDups = lead.duplicates?.filter((d) => d.status === 'OPEN') || [];
  const isCareer = String(lead.form_type || '').toLowerCase() === 'career' || lead.junk_reason === 'career';
  const pipeKey = isCareer ? 'career' : String(lead.website_code || '').toLowerCase();
  const backHref = ['mpf', 'rmw', 'ct', 'career'].includes(pipeKey) ? `/crm/pipeline/${pipeKey}` : '/crm/leads';
  const backLabel = isCareer ? 'Career Leads' : lead.website_code ? `${lead.website_code} Leads` : 'Leads';

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="flex items-center gap-1 border-b px-3 py-1.5 text-[12px] text-slate-500">
          <Link href={backHref} className="inline-flex items-center gap-1 hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-3.5 w-3.5" />{backLabel}</Link>
          <span>/</span><span className="font-mono">{lead.external_lead_id}</span>
        </div>
        <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold text-slate-900">{lead.name || 'Unnamed lead'}</h1>
              <WebsiteBadge code={lead.website_code} />
              <StatusBadge name={lead.status_name} color={lead.status_color} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-600">
              <span><span className="kv-label mr-1">Owner</span>{lead.assigned_user_name || <span className="text-amber-700">Unassigned</span>}</span>
              <span><span className="kv-label mr-1">Received</span>{formatDateTime(lead.external_created_at || lead.created_at)}</span>
              <span><span className="kv-label mr-1">Source</span>{[lead.source, lead.medium !== 'none' && lead.medium].filter(Boolean).join(' / ') || '—'}</span>
              {lead.form_type && <span><span className="kv-label mr-1">Form</span>{lead.form_type}</span>}
              <span><span className="kv-label mr-1">Next follow-up</span>{lead.next_followup_at ? <span className={new Date(lead.next_followup_at) < new Date() ? 'font-medium text-red-700' : ''}>{formatDateTime(lead.next_followup_at)}</span> : '—'}</span>
            </div>
            {lead.merged_into_lead_id && <p className="mt-2 text-sm text-amber-700">This lead was merged into <Link className="underline" href={`/crm/leads/${lead.merged_into_lead_id}`}>lead #{lead.merged_into_lead_id}</Link>.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('lead.edit') && (
              <Select className="w-44" value={lead.status_id} onChange={(e) => status.mutate(e.target.value)} disabled={status.isPending} aria-label="Change status">
                {lk?.statuses?.filter((s) => s.is_active || s.id === lead.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {((lead.assigned_user_id ? can('lead.reassign') : can('lead.assign'))) && <Button variant="outline" onClick={() => setDialog('assign')}><UserPlus />{lead.assigned_user_id ? 'Reassign' : 'Assign'}</Button>}
            {can('lead.edit') && <Button variant="outline" onClick={() => setDialog('edit')}><Pencil />Edit</Button>}
          </div>
        </div>
      </div>

      {openDups.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader><CardTitle className="flex items-center gap-2 text-amber-900"><Copy className="h-4 w-4" />Possible duplicates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {openDups.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-md border bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/crm/leads/${d.candidate_id}`} className="font-medium hover:underline">{d.name || 'Unnamed'}</Link>{' '}
                  <WebsiteBadge code={d.website_code} /> <span className="font-mono text-xs text-muted-foreground">{d.external_lead_id}</span>
                  <div className="text-xs text-muted-foreground">Matched on {(typeof d.match_reasons === 'string' ? JSON.parse(d.match_reasons) : d.match_reasons).join(', ').replace('cross_website', 'different website')}</div>
                </div>
                {can('lead.merge') && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild><Link href={`/crm/leads/${d.candidate_id}`}>View</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => resolveDup.mutate({ dupId: d.id, action: 'KEEP_SEPARATE' })}>Keep separate</Button>
                    <Button size="sm" onClick={() => confirm('Merge the other lead into this one? Both records and their external IDs are kept; the other lead is marked as merged.') && resolveDup.mutate({ dupId: d.id, action: 'MERGE', primaryLeadId: lead.id })}><GitMerge />Merge into this</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Lead information</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-2 hover:underline"><Phone className="h-4 w-4 text-muted-foreground" />{lead.phone}</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 break-all hover:underline"><Mail className="h-4 w-4 text-muted-foreground" />{lead.email}</a>}
              {lead.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{lead.location}</p>}
              {lead.interest && <p className="flex items-center gap-2"><Target className="h-4 w-4 text-muted-foreground" />{lead.interest}</p>}
              {lead.message && <div className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{lead.message}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Source attribution</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Source" value={a.source} />
                <Row label="Medium" value={a.medium} />
                <Row label="Campaign" value={a.campaign} />
                <Row label="Term" value={a.term} />
                <Row label="Content" value={a.content} />
                <Row label="Landing page" value={a.landing_page} />
                <Row label="Referrer" value={a.referrer} />
                <Row label="Page / form" value={a.page_name || lead.form_type} />
                <Row label="UTM source" value={a.utm_source} mono />
                <Row label="UTM medium" value={a.utm_medium} mono />
                <Row label="UTM campaign" value={a.utm_campaign} mono />
                <Row label="UTM term" value={a.utm_term} mono />
                <Row label="UTM content" value={a.utm_content} mono />
                {(a.gclid || a.fbclid || a.msclkid) && <Row label="Click ID" value={[a.gclid && `gclid ${a.gclid}`, a.fbclid && `fbclid ${a.fbclid}`, a.msclkid && `msclkid ${a.msclkid}`].filter(Boolean).join(' · ')} mono />}
                {attrExtra.self_reported_source && <Row label="Heard about us" value={attrExtra.self_reported_source} />}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Assignment</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y">
                <Row label="Assigned to" value={lead.assigned_user_name} />
                <Row label="Team" value={lead.team_name} />
                <Row label="Department" value={lead.department_name} />
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes ({lead.notes.length})</TabsTrigger>
              <TabsTrigger value="followups">Follow-ups ({lead.followups.filter((f) => f.status !== 'COMPLETED' && f.status !== 'CANCELLED').length})</TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              <Card>
                <CardContent className="pt-5">
                  {lead.activities.length === 0 ? <EmptyState title="No activity yet" /> : (
                    <ol className="relative ml-2 border-l">
                      {lead.activities.map((act) => (
                        <li key={act.id} className="mb-4 ml-4">
                          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400" />
                          <p className="text-sm font-medium">{ACTIVITY_LABELS[act.type] || titleCase(act.type)}</p>
                          {describeActivity(act) && <p className="text-sm text-muted-foreground">{describeActivity(act)}</p>}
                          <p className="text-xs text-muted-foreground">{act.actor || 'System'} · {formatDateTime(act.created_at)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this lead…" maxLength={5000} />
                    <div className="flex justify-end"><Button size="sm" type="submit" loading={addNote.isPending} disabled={!note.trim()}>Add note</Button></div>
                  </form>
                  {lead.notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : lead.notes.map((n) => (
                    <div key={n.id} className="rounded-md border p-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{n.author || 'Unknown'} · {formatDateTime(n.created_at)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="followups">
              <Card>
                <CardContent className="space-y-5 pt-5">
                  <FollowupForm leadId={lead.id} />
                  <div className="divide-y rounded-md border">
                    {lead.followups.length === 0 && <p className="p-4 text-sm text-muted-foreground">No follow-ups scheduled.</p>}
                    {lead.followups.map((f) => (
                      <div key={f.id} className="flex items-start justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <Clock className="h-4 w-4 text-muted-foreground" />{formatDateTime(f.due_at)}
                            <Badge variant={f.status === 'OVERDUE' ? 'danger' : f.status === 'COMPLETED' ? 'success' : 'info'}>{titleCase(f.status)}</Badge>
                            <Badge variant="outline">{titleCase(f.priority)}</Badge>
                          </div>
                          {f.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{f.notes}</p>}
                          <p className="mt-1 text-xs text-muted-foreground">Owner: {f.owner}</p>
                        </div>
                        {['UPCOMING', 'OVERDUE'].includes(f.status) && (
                          <Button size="sm" variant="outline" loading={completeFollowup.isPending && completeFollowup.variables === f.id} onClick={() => completeFollowup.mutate(f.id)}><CheckCircle2 />Done</Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <p className="mt-3 text-xs text-muted-foreground">Last updated {timeAgo(lead.updated_at)}</p>
        </div>
      </div>

      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={[lead.id]} />
      {dialog === 'edit' && <EditDialog lead={lead} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
