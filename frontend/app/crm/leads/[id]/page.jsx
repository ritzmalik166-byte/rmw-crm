'use client';
import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, MapPin, Target, UserPlus, Pencil, CalendarPlus, CheckCircle2, Copy, GitMerge, Clock, FileText } from 'lucide-react';
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
import { LeadDetailSkeleton } from '@/components/ui/skeletons';
import { AssignDialog } from '@/components/leads/LeadForms';
import { whatsappHref, WhatsAppIcon } from '@/components/leads/LeadsWorkspace';

function Row({ label, value, mono }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('col-span-2 break-words', mono && 'font-mono text-xs')}>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

const UTM_FIELDS = [['utm_source', 'UTM source'], ['utm_medium', 'UTM medium'], ['utm_campaign', 'UTM campaign'], ['utm_term', 'UTM term'], ['utm_content', 'UTM content']];

/** Explains how the visitor arrived, and why UTM fields may be empty for that kind of traffic. */
function channelOf(a) {
  const m = String(a.medium || '').toLowerCase();
  const blue = { tone: 'border-blue-200 bg-blue-50 text-blue-900', dot: 'bg-blue-500' };
  const green = { tone: 'border-emerald-200 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-500' };
  const amber = { tone: 'border-amber-200 bg-amber-50 text-amber-900', dot: 'bg-amber-500' };
  const slate = { tone: 'border-slate-200 bg-slate-50 text-slate-800', dot: 'bg-slate-400' };
  if (a.utm_source) return { ...blue, label: `Campaign · ${a.utm_source}${a.utm_medium ? ` / ${a.utm_medium}` : ''}` };
  if (a.gclid || a.msclkid) return { ...amber, label: `Paid search · ${a.gclid ? 'Google Ads' : 'Microsoft Ads'}`, why: 'Ad click detected by its click ID. Campaign name is missing because the ad has no UTM tracking template.' };
  if (a.fbclid) return { ...amber, label: 'Paid social · Meta', why: 'Ad click detected by fbclid. Add UTM tags to the ad URL to see the campaign.' };
  if (m === 'organic') return { ...green, label: `Organic search · ${titleCase(a.source)}`, why: 'Free search result. Organic visits never carry UTM tags, so campaign fields stay empty.' };
  if (m === 'social') return { ...blue, label: `Social · ${titleCase(a.source)}`, why: 'Came from a social link without UTM tags.' };
  if (m === 'referral') return { ...blue, label: `Referral · ${a.source}`, why: 'Came from a link on another website.' };
  if (!a.landing_page && !a.referrer) return { ...slate, label: 'Not tracked', why: 'The source website did not send any visit data for this lead.' };
  return { ...slate, label: 'Direct', why: 'Typed URL, bookmark, or app link. There is no referrer or UTM tag.' };
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

  if (isLoading) return <LeadDetailSkeleton />;
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
        <div className="flex items-center gap-1 border-b px-4 py-2.5 text-[12px] text-slate-500 lg:px-3 lg:py-1.5">
          <Link href={backHref} className="inline-flex items-center gap-1 hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-3.5 w-3.5" />{backLabel}</Link>
          <span>/</span><span className="font-mono">{lead.external_lead_id}</span>
        </div>
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-start lg:justify-between lg:gap-3 lg:px-3 lg:py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold text-slate-900">{lead.name || 'Unnamed lead'}</h1>
              <WebsiteBadge code={lead.website_code} />
              <StatusBadge name={lead.status_name} color={lead.status_color} />
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] text-slate-600 sm:mt-1.5 sm:flex sm:flex-wrap sm:gap-x-5 sm:gap-y-1 [&>span]:flex [&>span]:flex-col sm:[&>span]:block">
              <span><span className="kv-label mr-1">Owner</span>{lead.assigned_user_name || <span className="text-amber-700">Unassigned</span>}</span>
              <span><span className="kv-label mr-1">Received</span>{formatDateTime(lead.external_created_at || lead.created_at)}</span>
              <span><span className="kv-label mr-1">Source</span>{[lead.source, lead.medium !== 'none' && lead.medium].filter(Boolean).join(' / ') || '—'}</span>
              {lead.form_type && <span><span className="kv-label mr-1">Form</span>{lead.form_type}</span>}
              <span><span className="kv-label mr-1">Next follow-up</span>{lead.next_followup_at ? <span className={new Date(lead.next_followup_at) < new Date() ? 'font-medium text-red-700' : ''}>{formatDateTime(lead.next_followup_at)}</span> : '—'}</span>
            </div>
            {lead.merged_into_lead_id && <p className="mt-2 text-sm text-amber-700">This lead was merged into <Link className="underline" href={`/crm/leads/${lead.merged_into_lead_id}`}>lead #{lead.merged_into_lead_id}</Link>.</p>}
          </div>
          {(lead.phone || lead.email) && (
            <div className="grid grid-cols-3 gap-2 lg:hidden">
              {lead.phone && <a href={`tel:${lead.phone}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[hsl(var(--primary))] text-[13px] font-semibold text-white shadow-sm active:scale-[0.97]"><Phone className="h-4 w-4" />Call</a>}
              {whatsappHref(lead.phone) && <a href={whatsappHref(lead.phone)} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-[13px] font-semibold text-white shadow-sm active:scale-[0.97]"><WhatsAppIcon className="h-4 w-4" />WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 active:scale-[0.97]"><Mail className="h-4 w-4" />Email</a>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center [&>*]:w-full sm:[&>*]:w-auto">
            {can('lead.edit') && (
              <Select className="col-span-2 sm:w-44" value={lead.status_id} onChange={(e) => status.mutate(e.target.value)} disabled={status.isPending} aria-label="Change status">
                {lk?.statuses?.filter((s) => s.is_active || s.id === lead.status_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            {((lead.assigned_user_id ? can('lead.reassign') : can('lead.assign'))) && <Button variant="outline" onClick={() => setDialog('assign')}><UserPlus />{lead.assigned_user_id ? 'Transfer lead' : 'Assign'}</Button>}
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
              {lead.phone && (
                <div className="flex items-center gap-2">
                  <a href={`tel:${lead.phone}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline"><Phone className="h-4 w-4 shrink-0 text-muted-foreground" />{lead.phone}</a>
                  <a href={`tel:${lead.phone}`} aria-label="Call" className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(213_70%_94%)] text-[hsl(var(--primary))] active:scale-95"><Phone className="h-4 w-4" /></a>
                  {whatsappHref(lead.phone) && <a href={whatsappHref(lead.phone)} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 active:scale-95"><WhatsAppIcon className="h-[18px] w-[18px]" /></a>}
                </div>
              )}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 break-all hover:underline"><Mail className="h-4 w-4 text-muted-foreground" />{lead.email}</a>}
              {lead.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{lead.location}</p>}
              {lead.interest && <p className="flex items-center gap-2"><Target className="h-4 w-4 text-muted-foreground" />{lead.interest}</p>}
              {lead.resume_url && <a href={lead.resume_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-medium text-[hsl(var(--primary))] hover:underline"><FileText className="h-4 w-4" />View resume</a>}
              {lead.message && <div className="mt-3 whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-sm">{lead.message}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Source attribution</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const ch = channelOf(a);
                const hasUtm = UTM_FIELDS.some(([k]) => a[k]);
                return (
                  <>
                    <div className={cn('mb-3 flex items-start gap-2.5 rounded-md border px-3 py-2', ch.tone)}>
                      <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', ch.dot)} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">{ch.label}</p>
                        <p className="text-[11px] opacity-80">{hasUtm ? 'Tagged with UTM parameters.' : ch.why}</p>
                      </div>
                    </div>
                    <dl className="divide-y">
                      <Row label="Source" value={a.source} />
                      <Row label="Medium" value={a.medium} />
                      {(a.campaign || hasUtm) && <Row label="Campaign" value={a.campaign} />}
                      {a.term && <Row label="Term" value={a.term} />}
                      {a.content && <Row label="Content" value={a.content} />}
                      <Row label="Landing page" value={a.landing_page} />
                      <Row label="Referrer" value={a.referrer} />
                      <Row label="Page / form" value={a.page_name || lead.form_type} />
                      {hasUtm && UTM_FIELDS.map(([k, label]) => <Row key={k} label={label} value={a[k]} mono />)}
                      {(a.gclid || a.fbclid || a.msclkid) && <Row label="Click ID" value={[a.gclid && `gclid ${a.gclid}`, a.fbclid && `fbclid ${a.fbclid}`, a.msclkid && `msclkid ${a.msclkid}`].filter(Boolean).join(' · ')} mono />}
                      {attrExtra.self_reported_source && <Row label="Heard about us" value={attrExtra.self_reported_source} />}
                    </dl>
                  </>
                );
              })()}
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

      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={[lead.id]} currentOwner={lead.assigned_user_id ? { id: lead.assigned_user_id, name: lead.assigned_user_name } : null} leadName={lead.name} />
      {dialog === 'edit' && <EditDialog lead={lead} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
