'use client';
import { useUiVersion } from '@/lib/useUiVersion';
import { LegacyLeadDetail } from '@/components/legacy/LeadDetail';
import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Mail, Phone, MapPin, Target, UserPlus, Pencil, CalendarPlus, CheckCircle2, Copy, GitMerge, Clock, FileText,
  Sparkles, RefreshCw, ArrowRightLeft, MessageSquare, Trophy, ExternalLink, User, Users, Building2, CalendarClock, Globe2,
  Check, Quote, Send, Megaphone,
} from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useLookups } from '@/lib/hooks';
import { formatDateTime, timeAgo, titleCase, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, EmptyState } from '@/components/ui/feedback';
import { LeadDetailSkeleton } from '@/components/ui/skeletons';
import { AssignDialog } from '@/components/leads/LeadForms';
import { whatsappHref, WhatsAppIcon } from '@/components/leads/LeadsWorkspace';
import { LeadAttribution } from '@/components/marketing/LeadAttribution';
import { LEAD_SOURCE_TYPES } from '@/lib/leadSources';

import { confirmAction } from '@/components/ui/confirm';
import { AssignmentBanner } from '@/components/leads/AssignmentBanner';
const parse = (v, fallback) => (typeof v === 'string' ? (() => { try { return JSON.parse(v || 'null') ?? fallback; } catch { return fallback; } })() : v ?? fallback);

function copy(text, label = 'Copied') {
  if (!text) return;
  navigator.clipboard?.writeText(String(text)).then(() => toast.success(label), () => toast.error('Could not copy'));
}

function CopyButton({ value, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => { copy(value, `${label} copied`); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Row({ label, value, mono, href }) {
  const isUrl = href ?? /^https?:\/\//i.test(String(value || ''));
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-3 py-2 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('min-w-0 break-words text-slate-800', mono && 'font-mono text-xs')}>
        {!value ? <span className="text-slate-400">—</span>
          : isUrl ? <a href={value} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-[hsl(var(--primary))] hover:underline"><span className="truncate">{String(value).replace(/^https?:\/\/(www\.)?/, '')}</span><ExternalLink className="h-3 w-3 shrink-0" /></a>
          : value}
      </dd>
    </div>
  );
}

function ContactRow({ icon: Icon, href, value, label, external, children }) {
  const inner = <><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1 break-all">{value}</span></>;
  return (
    <div className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50">
      {href ? <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="flex min-w-0 flex-1 items-center gap-3 text-slate-800 hover:text-[hsl(var(--primary))]">{inner}</a> : <div className="flex min-w-0 flex-1 items-center gap-3 text-slate-800">{inner}</div>}
      {children}
      {label && <CopyButton value={value} label={label} />}
    </div>
  );
}

/** Main brand sites; a lead arriving on any other domain came through a dedicated landing page. */
const MAIN_DOMAINS = /(^|\.)(mypropertyfact\.in|ritzmediaworld\.com|creativethinks\.in|creativethinksmedia\.com)$/i;
const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** "Landing page" only for real landing-page leads (e.g. Eldeco campaigns); project forms show the project page. */
function pageKind(a, lead, extra) {
  const name = `${a.page_name || ''} ${lead.form_type || ''}`.toLowerCase();
  const url = a.landing_page || '';
  const host = hostOf(url);
  if (/landing|lp\b|campaign/.test(name) || (host && !MAIN_DOMAINS.test(host))) return { label: 'Landing page', url };
  if (/project/.test(name)) return { label: 'Project page', url: extra.project_link || url };
  return { label: 'Form page', url };
}

const UTM_FIELDS = [['utm_source', 'UTM source'], ['utm_medium', 'UTM medium'], ['utm_campaign', 'UTM campaign'], ['utm_term', 'UTM term'], ['utm_content', 'UTM content']];

/** Explains how the visitor arrived, and why UTM fields may be empty for that kind of traffic. */
function channelOf(a) {
  const m = String(a.medium || '').toLowerCase();
  const blue = { tone: 'border-blue-200 bg-blue-50/70 text-blue-900', dot: 'bg-blue-500' };
  const green = { tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-900', dot: 'bg-emerald-500' };
  const amber = { tone: 'border-amber-200 bg-amber-50/70 text-amber-900', dot: 'bg-amber-500' };
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

const ACTIVITY = {
  LEAD_CREATED: { label: 'Lead created', icon: Sparkles, tone: 'bg-blue-50 text-blue-600 ring-blue-200' },
  LEAD_SYNCED: { label: 'Updated from source website', icon: RefreshCw, tone: 'bg-sky-50 text-sky-600 ring-sky-200' },
  LEAD_ASSIGNED: { label: 'Lead assigned', icon: UserPlus, tone: 'bg-indigo-50 text-indigo-600 ring-indigo-200' },
  LEAD_REASSIGNED: { label: 'Lead reassigned', icon: Users, tone: 'bg-indigo-50 text-indigo-600 ring-indigo-200' },
  ASSIGNMENT_ACKNOWLEDGED: { label: 'Assignment acknowledged', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  STATUS_CHANGED: { label: 'Status changed', icon: ArrowRightLeft, tone: 'bg-amber-50 text-amber-600 ring-amber-200' },
  LEAD_UPDATED: { label: 'Lead details updated', icon: Pencil, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  NOTE_ADDED: { label: 'Note added', icon: MessageSquare, tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
  FOLLOWUP_CREATED: { label: 'Follow-up scheduled', icon: CalendarPlus, tone: 'bg-violet-50 text-violet-600 ring-violet-200' },
  FOLLOWUP_COMPLETED: { label: 'Follow-up completed', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  CONVERTED: { label: 'Converted', icon: Trophy, tone: 'bg-emerald-50 text-emerald-600 ring-emerald-200' },
  LEAD_MERGED: { label: 'Merged', icon: GitMerge, tone: 'bg-orange-50 text-orange-600 ring-orange-200' },
  META_LEAD_RECEIVED: { label: 'Lead received from Meta Ads', icon: Megaphone, tone: 'bg-blue-50 text-blue-600 ring-blue-200' },
};

function describeActivity(a) {
  const m = parse(a.meta, {});
  if (a.type === 'STATUS_CHANGED' || a.type === 'CONVERTED') return `${titleCase(m.from)} → ${titleCase(m.to)}`;
  if (a.type === 'LEAD_UPDATED') return m.fields?.join(', ');
  if (a.type === 'LEAD_CREATED') return [m.website, m.externalLeadId, m.source && `via ${m.source}`].filter(Boolean).join(' · ');
  if (a.type === 'FOLLOWUP_CREATED') return m.dueAt && `Due ${formatDateTime(m.dueAt)}`;
  if (a.type === 'META_LEAD_RECEIVED') return [m.campaign && `Campaign: ${m.campaign}`, m.form && `Form: ${m.form}`, m.platform && titleCase(m.platform)].filter(Boolean).join(' · ') || null;
  if (a.type === 'LEAD_SYNCED' && m.via === 'meta') return 'Re-delivered by Meta';
  if (a.type === 'LEAD_MERGED') return m.mergedExternalId ? `Merged ${m.mergedExternalId} into this lead` : 'Merged into another lead';
  if (m.reason) return m.reason;
  return null;
}

const AVATAR_TONE = { MPF: 'from-teal-500 to-emerald-600', RMW: 'from-rose-500 to-orange-500', CT: 'from-purple-500 to-indigo-600' };
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';

function StatusStepper({ statuses, current, onPick, disabled }) {
  if (!statuses?.length) return null;
  const list = [...statuses].sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
  const idx = list.findIndex((s) => s.id === current);
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-max items-center gap-1">
        {list.map((s, i) => {
          const active = i === idx;
          const past = idx >= 0 && i < idx && !s.is_closed;
          return (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled || active}
                onClick={() => onPick(s.id)}
                title={active ? 'Current status' : `Move to ${s.name}`}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition',
                  active ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white shadow-sm'
                    : past ? 'border-[hsl(213_60%_85%)] bg-[hsl(213_70%_96%)] text-[hsl(var(--primary))] hover:bg-[hsl(213_70%_92%)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  disabled && !active && 'cursor-not-allowed opacity-60',
                )}
              >
                {past ? <Check className="h-3.5 w-3.5" /> : <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-slate-300')} />}
                {s.name}
              </button>
              {i < list.length - 1 && <span className={cn('h-px w-3', past || active ? 'bg-[hsl(213_60%_75%)]' : 'bg-slate-200')} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatTile({ icon: Icon, label, children, tone }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone || 'bg-slate-100 text-slate-500')}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="kv-label">{label}</p>
        <div className="break-words text-[13px] font-medium leading-snug text-slate-800 [overflow-wrap:anywhere] lg:truncate">{children}</div>
      </div>
    </div>
  );
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
          <Field label="Phone"><Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Interest"><Input value={f.interest} onChange={set('interest')} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">The external lead ID and source attribution can&apos;t be edited.</p>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const QUICK_SLOTS = [
  ['In 1 hour', () => new Date(Date.now() + 3600e3)],
  ['Tomorrow 10am', () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }],
  ['In 3 days', () => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0); return d; }],
  ['Next week', () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; }],
];
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

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
    <form className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-medium text-slate-500">Quick pick:</span>
        {QUICK_SLOTS.map(([label, fn]) => (
          <button key={label} type="button" onClick={() => { const d = fn(); setDate(localDate(d)); setTime(localTime(d)); }}
            className="min-h-[36px] rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] lg:min-h-0 lg:px-2.5 text-slate-700 hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">{label}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} min={localDate(new Date())} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
        <Field label="Priority">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
          </Select>
        </Field>
        <div className="flex items-end"><Button type="submit" className="w-full" loading={m.isPending}><CalendarPlus />Schedule</Button></div>
        <Field label="Notes" className="col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What should happen on this follow-up?" /></Field>
      </div>
    </form>
  );
}

const PRIORITY_TONE = { LOW: 'secondary', MEDIUM: 'info', HIGH: 'warning', URGENT: 'danger' };

function LeadDetailV2({ params }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { can, me } = useAuth();
  const router = useRouter();
  // Return to whichever page opened this lead (keeps its filters/scroll);
  // fall back to the pipeline link when the lead was opened directly.
  const goBack = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
  };
  const user = me?.user;
  const { data: lk } = useLookups();
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState('activity');
  // Phone action bar: jump to a tab and bring it into view.
  const openTab = (t) => { setTab(t); requestAnimationFrame(() => document.getElementById('lead-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const { data: lead, isLoading, isError, error, refetch } = useQuery({ queryKey: ['lead', id], queryFn: () => api(`/crm/leads/${id}`) });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lead', id] }); qc.invalidateQueries({ queryKey: ['leads'] }); };
  const status = useMutation({
    mutationFn: (statusId) => api(`/crm/leads/${id}`, { method: 'PATCH', body: { statusId: Number(statusId) } }),
    onSuccess: () => { toast.success('Status updated'); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const addNote = useMutation({
    mutationFn: () => api(`/crm/leads/${id}/notes`, { method: 'POST', body: { body: note } }),
    onSuccess: () => { setNote(''); toast.success('Note added'); invalidate(); },
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
  const attrExtra = parse(a.extra, {});
  const openDups = lead.duplicates?.filter((d) => d.status === 'OPEN') || [];
  const isCareer = String(lead.form_type || '').toLowerCase() === 'career' || lead.junk_reason === 'career';
  const pipeKey = isCareer ? 'career' : String(lead.website_code || '').toLowerCase();
  const backHref = ['mpf', 'rmw', 'ct', 'ctmpl', 'career'].includes(pipeKey) ? `/crm/pipeline/${pipeKey}` : '/crm/leads';
  const receivedAt = lead.external_created_at || lead.created_at;
  const overdue = lead.next_followup_at && new Date(lead.next_followup_at) < new Date();
  const openFollowups = lead.followups.filter((f) => f.status !== 'COMPLETED' && f.status !== 'CANCELLED');
  const wa = whatsappHref(lead.phone);
  const statuses = lk?.statuses?.filter((s) => s.is_active || s.id === lead.status_id);
  const sourceText = lead.source_type === LEAD_SOURCE_TYPES.META
    ? `Meta Ads${lead.campaign_name ? ` · ${lead.campaign_name}` : ''}`
    : [lead.source, lead.medium !== 'none' && lead.medium].filter(Boolean).join(' / ');

  return (
    <div className="min-w-0 space-y-4 max-lg:pb-20">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-[12px] text-slate-500">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href={backHref} onClick={goBack} title="Back to previous page" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-[hsl(var(--primary))]"><ArrowLeft className="h-3.5 w-3.5" />Back</Link>
            <span className="text-slate-300">/</span>
            <button type="button" onClick={() => copy(lead.external_lead_id, 'Lead ID copied')} className="truncate rounded-md px-1.5 py-0.5 font-mono hover:bg-slate-100" title="Copy lead ID">{lead.external_lead_id}</button>
          </div>
          <span className="hidden shrink-0 sm:inline">Updated {timeAgo(lead.updated_at)}</span>
        </div>

        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-semibold text-white shadow-sm', AVATAR_TONE[lead.website_code] || 'from-slate-500 to-slate-700')}>{initials(lead.name)}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-[18px] font-semibold leading-tight text-slate-900 sm:text-[20px]">{lead.name || 'Unnamed lead'}</h1>
                <WebsiteBadge code={lead.website_code} />
                <StatusBadge name={lead.status_name} color={lead.status_color} />
                {openDups.length > 0 && <Badge variant="warning"><Copy className="mr-1 h-3 w-3" />{openDups.length} possible duplicate{openDups.length > 1 ? 's' : ''}</Badge>}
              </div>
              <p className="mt-1 text-[13px] text-slate-500">
                {lead.interest ? <>Interested in <span className="font-medium text-slate-700">{lead.interest}</span> · </> : null}
                Received {timeAgo(receivedAt)}{lead.form_type ? <> via <span className="font-medium text-slate-700">{lead.form_type}</span></> : null}
              </p>
              {lead.merged_into_lead_id && <p className="mt-2 text-sm text-amber-700">This lead was merged into <Link className="underline" href={`/crm/leads/${lead.merged_into_lead_id}`}>lead #{lead.merged_into_lead_id}</Link>.</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 [&>*]:max-sm:flex-1">
            {lead.phone && <Button asChild className="bg-[hsl(var(--primary))] max-lg:hidden"><a href={`tel:${lead.phone}`}><Phone />Call</a></Button>}
            {wa && <Button asChild variant="outline" className="max-lg:hidden border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"><a href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-4 w-4" />WhatsApp</a></Button>}
            {lead.email && <Button asChild variant="outline"><a href={`mailto:${lead.email}`}><Mail />Email</a></Button>}
            {((lead.assigned_user_id ? can('lead.reassign') : can('lead.assign'))) && <Button variant="outline" onClick={() => setDialog('assign')}><UserPlus />{lead.assigned_user_id ? 'Transfer' : 'Assign'}</Button>}
            {can('lead.edit') && <Button variant="outline" size="icon" aria-label="Edit lead" title="Edit lead" onClick={() => setDialog('edit')} className="max-sm:flex-none"><Pencil /></Button>}
          </div>
        </div>

        {statuses?.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="kv-label hidden shrink-0 sm:inline">Stage</span>
              {can('lead.edit') ? (
                <>
                  <div className="hidden min-w-0 flex-1 md:block"><StatusStepper statuses={statuses} current={lead.status_id} disabled={status.isPending} onPick={(sid) => status.mutate(sid)} /></div>
                  <Select className="md:hidden" value={lead.status_id} onChange={(e) => status.mutate(e.target.value)} disabled={status.isPending} aria-label="Change status">
                    {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </>
              ) : <StatusBadge name={lead.status_name} color={lead.status_color} />}
            </div>
          </div>
        )}
      </div>

      <AssignmentBanner lead={lead} userId={user?.id} />

      {/* ── Key facts ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <StatTile icon={User} label="Owner" tone={lead.assigned_user_name ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}>
          {lead.assigned_user_name || <span className="text-amber-700">Unassigned</span>}
        </StatTile>
        <StatTile icon={Clock} label="Received" tone="bg-blue-50 text-blue-600"><span title={formatDateTime(receivedAt)}>{formatDateTime(receivedAt)}</span></StatTile>
        <StatTile icon={Globe2} label="Source" tone="bg-emerald-50 text-emerald-600">{sourceText || '—'}</StatTile>
        <StatTile icon={CalendarClock} label="Next follow-up" tone={overdue ? 'bg-red-50 text-red-600' : 'bg-violet-50 text-violet-600'}>
          {lead.next_followup_at ? <span className={overdue ? 'text-red-700' : ''}>{overdue ? 'Overdue · ' : ''}{formatDateTime(lead.next_followup_at)}</span> : <span className="text-slate-400">Not scheduled</span>}
        </StatTile>
      </div>

      {openDups.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader><CardTitle className="text-amber-900"><Copy className="h-4 w-4" />Possible duplicates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {openDups.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/crm/leads/${d.candidate_id}`} className="font-medium hover:underline">{d.name || 'Unnamed'}</Link>{' '}
                  <WebsiteBadge code={d.website_code} /> <span className="font-mono text-xs text-muted-foreground">{d.external_lead_id}</span>
                  <div className="text-xs text-muted-foreground">Matched on {parse(d.match_reasons, []).join(', ').replace('cross_website', 'different website')}</div>
                </div>
                {can('lead.merge') && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild><Link href={`/crm/leads/${d.candidate_id}`}>View</Link></Button>
                    <Button size="sm" variant="outline" onClick={() => resolveDup.mutate({ dupId: d.id, action: 'KEEP_SEPARATE' })}>Keep separate</Button>
                    <Button size="sm" onClick={() => confirmAction({ title: 'Merge into this lead?', description: 'Both records and their external IDs are kept; the other lead is marked as merged into this one.', confirmText: 'Merge leads', icon: 'merge' }, () => resolveDup.mutate({ dupId: d.id, action: 'MERGE', primaryLeadId: lead.id }))}><GitMerge />Merge into this</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        {/* ── Left column ───────────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-0.5 p-3 text-[13px]">
              {lead.phone && (
                <ContactRow icon={Phone} href={`tel:${lead.phone}`} value={lead.phone} label="Phone">
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"><WhatsAppIcon className="h-4 w-4" /></a>}
                </ContactRow>
              )}
              {lead.email && <ContactRow icon={Mail} href={`mailto:${lead.email}`} value={lead.email} label="Email" />}
              {lead.location && <ContactRow icon={MapPin} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.location)}`} external value={lead.location} />}
              {lead.interest && <ContactRow icon={Target} value={lead.interest} />}
              {lead.resume_url && <ContactRow icon={FileText} href={lead.resume_url} external value="View resume" />}
              {!lead.phone && !lead.email && !lead.location && <p className="px-1 py-2 text-slate-400">No contact details captured.</p>}
              {lead.message && (
                <div className="relative mt-3 rounded-lg border-l-[3px] border-[hsl(var(--saffron))] bg-amber-50/40 py-2.5 pl-8 pr-3 text-[13px] leading-relaxed text-slate-700">
                  <Quote className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-amber-500" />
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{lead.message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {lead.source_type === LEAD_SOURCE_TYPES.META ? <LeadAttribution lead={lead} /> : (
          <Card>
            <CardHeader><CardTitle>Source attribution</CardTitle></CardHeader>
            <CardContent>
              {(() => {
                const ch = channelOf(a);
                const hasUtm = UTM_FIELDS.some(([k]) => a[k]);
                return (
                  <>
                    <div className={cn('mb-2 flex items-start gap-2.5 rounded-lg border px-3 py-2.5', ch.tone)}>
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-white/60', ch.dot)} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">{ch.label}</p>
                        <p className="mt-0.5 text-[12px] opacity-80">{hasUtm ? 'Tagged with UTM parameters.' : ch.why}</p>
                      </div>
                    </div>
                    <dl className="divide-y divide-slate-100">
                      <Row label="Source" value={a.source} />
                      <Row label="Medium" value={a.medium} />
                      {(a.campaign || hasUtm) && <Row label="Campaign" value={a.campaign} />}
                      {a.term && <Row label="Term" value={a.term} />}
                      {a.content && <Row label="Content" value={a.content} />}
                      {(() => {
                        const kind = pageKind(a, lead, attrExtra);
                        const url = kind.url && (/^https?:/i.test(kind.url) ? kind.url : `https://${kind.url}`);
                        return <Row label={kind.label} value={url} />;
                      })()}
                      <Row label="Referrer" value={a.referrer} />
                      <Row label="Page / form" value={a.page_name || lead.form_type} />
                      {hasUtm && UTM_FIELDS.map(([k, label]) => <Row key={k} label={label} value={a[k]} mono />)}
                      {(a.gclid || a.fbclid || a.msclkid) && <Row label="Click ID" value={[a.gclid && `gclid ${a.gclid}`, a.fbclid && `fbclid ${a.fbclid}`, a.msclkid && `msclkid ${a.msclkid}`].filter(Boolean).join(' · ')} mono href={false} />}
                      {attrExtra.self_reported_source && <Row label="Heard about us" value={attrExtra.self_reported_source} />}
                    </dl>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <UserAvatar name={lead.assigned_user_name} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-800">{lead.assigned_user_name || 'Nobody yet'}</p>
                  <p className="text-[12px] text-slate-500">{lead.assigned_user_name ? 'Lead owner' : 'Assign this lead so it gets followed up'}</p>
                </div>
                {((lead.assigned_user_id ? can('lead.reassign') : can('lead.assign'))) && <Button size="sm" variant="outline" onClick={() => setDialog('assign')}>{lead.assigned_user_id ? 'Change' : 'Assign'}</Button>}
              </div>
              <dl className="divide-y divide-slate-100 border-t border-slate-100">
                <Row label="Team" value={lead.team_name} />
                <Row label="Department" value={lead.department_name} />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* ── Right column ──────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab} id="lead-tabs" className="scroll-mt-20">
            <TabsList className="max-w-full overflow-x-auto [scrollbar-width:none]">
              <TabsTrigger value="activity">Activity<Count n={lead.activities.length} /></TabsTrigger>
              <TabsTrigger value="notes">Notes<Count n={lead.notes.length} /></TabsTrigger>
              <TabsTrigger value="followups">Follow-ups<Count n={openFollowups.length} alert={overdue} /></TabsTrigger>
            </TabsList>

            <TabsContent value="activity">
              <Card>
                <CardContent className="space-y-5 pt-5">
                  <NoteComposer user={user} note={note} setNote={setNote} onSubmit={() => addNote.mutate()} pending={addNote.isPending} compact />
                  {lead.activities.length === 0 ? <EmptyState title="No activity yet" /> : (
                    <ol className="relative">
                      {lead.activities.map((act, i) => {
                        const meta = ACTIVITY[act.type] || { label: titleCase(act.type), icon: Sparkles, tone: 'bg-slate-100 text-slate-600 ring-slate-200' };
                        const Icon = meta.icon;
                        const desc = describeActivity(act);
                        return (
                          <li key={act.id} className="relative flex gap-3 pb-5 last:pb-0">
                            {i < lead.activities.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-slate-200" aria-hidden />}
                            <span className={cn('relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1', meta.tone)}><Icon className="h-3.5 w-3.5" /></span>
                            <div className="min-w-0 flex-1 pt-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <p className="text-[13px] font-medium text-slate-800">{meta.label}</p>
                                <time className="text-[11px] text-slate-400" title={formatDateTime(act.created_at)} dateTime={act.created_at}>{timeAgo(act.created_at)}</time>
                              </div>
                              {desc && <p className="mt-0.5 text-[13px] text-slate-600">{desc}</p>}
                              <p className="mt-0.5 text-[11px] text-slate-400">by {act.actor || 'System'}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardContent className="space-y-4 pt-5">
                  <NoteComposer user={user} note={note} setNote={setNote} onSubmit={() => addNote.mutate()} pending={addNote.isPending} />
                  {lead.notes.length === 0 ? <EmptyState title="No notes yet" description="Log call outcomes, requirements and budget here so the whole team stays in sync." /> : (
                    <div className="space-y-3">
                      {lead.notes.map((n) => (
                        <div key={n.id} className="flex gap-3">
                          <UserAvatar name={n.author} className="h-8 w-8" />
                          <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5">
                            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
                              <span className="text-[13px] font-medium text-slate-800">{n.author || 'Unknown'}</span>
                              <time className="text-[11px] text-slate-400" title={formatDateTime(n.created_at)}>{timeAgo(n.created_at)}</time>
                            </div>
                            <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] leading-relaxed text-slate-700">{n.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="followups">
              <Card>
                <CardContent className="space-y-5 pt-5">
                  <FollowupForm leadId={lead.id} />
                  {lead.followups.length === 0 ? <EmptyState title="No follow-ups scheduled" description="Use a quick pick above to book the next call." /> : (
                    <div className="space-y-2">
                      {lead.followups.map((f) => {
                        const done = f.status === 'COMPLETED';
                        return (
                          <div key={f.id} className={cn('flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3 sm:flex-nowrap', f.status === 'OVERDUE' ? 'border-red-200 bg-red-50/40' : done ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white')}>
                            <div className="flex min-w-0 gap-3">
                              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', done ? 'bg-emerald-50 text-emerald-600' : f.status === 'OVERDUE' ? 'bg-red-100 text-red-600' : 'bg-violet-50 text-violet-600')}>
                                {done ? <CheckCircle2 className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-slate-800">
                                  <span className={done ? 'text-slate-500 line-through' : ''}>{formatDateTime(f.due_at)}</span>
                                  <Badge variant={f.status === 'OVERDUE' ? 'danger' : done ? 'success' : 'info'}>{titleCase(f.status)}</Badge>
                                  <Badge variant={PRIORITY_TONE[f.priority] || 'outline'}>{titleCase(f.priority)}</Badge>
                                </div>
                                {f.notes && <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] text-slate-600">{f.notes}</p>}
                                <p className="mt-1 text-[11px] text-slate-400">Owner: {f.owner}</p>
                              </div>
                            </div>
                            {['UPCOMING', 'OVERDUE'].includes(f.status) && (
                              <Button size="sm" variant="outline" loading={completeFollowup.isPending && completeFollowup.variables === f.id} onClick={() => completeFollowup.mutate(f.id)}><CheckCircle2 />Done</Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Phone / tablet action bar, pinned above the bottom tab bar ── */}
      <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),14px)+59px)] z-30 border-t border-slate-200 bg-white/95 px-2 py-1.5 shadow-[0_-6px_20px_-12px_rgb(15_23_42/0.25)] backdrop-blur-md md:bottom-[calc(max(env(safe-area-inset-bottom),18px)+65px)] lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1 text-[11px] font-medium text-slate-700 [&>*]:flex [&>*]:min-h-[48px] [&>*]:flex-col [&>*]:items-center [&>*]:justify-center [&>*]:gap-0.5 [&>*]:rounded-lg">
          {lead.phone
            ? <a href={`tel:${lead.phone}`} className="bg-[hsl(var(--primary))] text-white active:opacity-90"><Phone className="h-5 w-5" />Call</a>
            : <span className="text-slate-300"><Phone className="h-5 w-5" />Call</span>}
          {wa
            ? <a href={wa} target="_blank" rel="noopener noreferrer" className="text-emerald-700 active:bg-emerald-50"><WhatsAppIcon className="h-5 w-5" />WhatsApp</a>
            : <span className="text-slate-300"><WhatsAppIcon className="h-5 w-5" />WhatsApp</span>}
          {can('lead.edit') && statuses?.length > 0
            ? (
              <label className="relative active:bg-slate-100">
                <ArrowRightLeft className="h-5 w-5" />Status
                <Select className="absolute inset-0 h-full w-full cursor-pointer opacity-0 lg:h-full" value={lead.status_id} onChange={(e) => status.mutate(e.target.value)} disabled={status.isPending} aria-label="Change status">
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </label>
            )
            : <span className="text-slate-300"><ArrowRightLeft className="h-5 w-5" />Status</span>}
          <button type="button" onClick={() => openTab('followups')} className={cn('active:bg-slate-100', overdue && 'text-red-700')}><CalendarPlus className="h-5 w-5" />Follow-up</button>
          <button type="button" onClick={() => openTab('notes')} className="active:bg-slate-100"><MessageSquare className="h-5 w-5" />Note</button>
        </div>
      </div>

      <AssignDialog open={dialog === 'assign'} onOpenChange={(o) => !o && setDialog(null)} leadIds={[lead.id]} currentOwner={lead.assigned_user_id ? { id: lead.assigned_user_id, name: lead.assigned_user_name } : null} leadName={lead.name} sourceTypes={[lead.source_type]} />
      {dialog === 'edit' && <EditDialog lead={lead} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}

function Count({ n, alert }) {
  if (!n) return null;
  return <span className={cn('ml-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold', alert ? 'bg-red-100 text-red-700' : 'bg-slate-200/80 text-slate-600 group-data-[state=active]:bg-[hsl(213_70%_94%)] group-data-[state=active]:text-[hsl(var(--primary))]')}>{n}</span>;
}

function NoteComposer({ user, note, setNote, onSubmit, pending, compact }) {
  const [focused, setFocused] = useState(false);
  const open = !compact || focused || note;
  return (
    <form className="flex gap-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) onSubmit(); }}>
      <UserAvatar src={user?.avatar} name={user?.full_name} className="h-8 w-8" />
      <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white transition focus-within:border-[hsl(var(--ring))] focus-within:ring-2 focus-within:ring-[hsl(213_70%_90%)]">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && note.trim()) onSubmit(); }}
          placeholder="Log a call, add a note…"
          maxLength={5000}
          rows={open ? 3 : 1}
          className="min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        {open && (
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5">
            <span className="text-[11px] text-slate-400">Ctrl + Enter to save</span>
            <Button size="sm" type="submit" loading={pending} disabled={!note.trim()} onMouseDown={(e) => e.preventDefault()}><Send />Add note</Button>
          </div>
        )}
      </div>
    </form>
  );
}

export default function LeadDetailPage(props) { const v = useUiVersion(); if (v === null) return null; return v === 2 ? <LeadDetailV2 {...props} /> : <LegacyLeadDetail {...props} />; }
