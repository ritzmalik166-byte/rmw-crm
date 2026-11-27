'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, PhoneCall, PhoneMissed, PhoneOff, Clock, ChevronDown, Ban, FlaskConical, PhoneIncoming, User, Wifi } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime, timeAgo, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { confirmAction } from '@/components/ui/confirm';

export const STATUS = {
  SCHEDULED: { label: 'Scheduled', variant: 'info', icon: Clock },
  DIALING: { label: 'Calling…', variant: 'info', icon: PhoneCall },
  IN_PROGRESS: { label: 'On the call', variant: 'info', icon: PhoneCall },
  COMPLETED: { label: 'Completed', variant: 'success', icon: PhoneCall },
  NO_ANSWER: { label: 'No answer', variant: 'warning', icon: PhoneMissed },
  BUSY: { label: 'Busy', variant: 'warning', icon: PhoneMissed },
  FAILED: { label: 'Failed', variant: 'danger', icon: PhoneOff },
  CANCELLED: { label: 'Cancelled', variant: 'secondary', icon: Ban },
  SKIPPED: { label: 'Skipped', variant: 'secondary', icon: Ban },
};
export const OUTCOME_VARIANT = { INTERESTED: 'success', CALLBACK: 'info', NOT_INTERESTED: 'secondary', WRONG_NUMBER: 'warning', DO_NOT_CALL: 'danger', UNCLEAR: 'secondary' };

export const ANSWER_LABELS = [
  ['company', 'Company'], ['service', 'Service needed'], ['goal', 'Goal'], ['currentMarketing', 'Current marketing'],
  ['decisionMaker', 'Decision maker'], ['website', 'Website'],
  ['configuration', 'Configuration'], ['budget', 'Budget'], ['location', 'Preferred location'], ['purpose', 'Purpose'],
  ['timeline', 'Buying timeline'], ['siteVisit', 'Site visit'], ['callbackTime', 'Call back'], ['language', 'Language'], ['notes', 'Notes'],
];

/**
 * Connect / disconnect badges for a call, from the provider's hangup data (Bolna: telephony_data.hangup_by).
 * Connected = the customer picked up. Then who ended it: the customer (User) or the AI agent (Agent).
 */
const CONNECT_STATES = {
  COMPLETED: { label: 'Connected', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', icon: PhoneIncoming },
  NO_ANSWER: { label: 'Not connected', cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', icon: PhoneMissed },
  BUSY: { label: 'Not connected', cls: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', icon: PhoneMissed },
  FAILED: { label: 'Not connected', cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', icon: PhoneOff },
};
const ENDED_BY = {
  USER: { label: 'User disconnected', title: 'The customer hung up the call', cls: 'bg-sky-50 text-sky-700 ring-sky-200', icon: User },
  AGENT: { label: 'Agent disconnected', title: 'The AI agent ended the call', cls: 'bg-violet-50 text-violet-700 ring-violet-200', icon: Bot },
  SYSTEM: { label: 'Call dropped', title: 'Ended by silence, the time limit or the network', cls: 'bg-slate-100 text-slate-700 ring-slate-200', icon: Wifi },
};
const pill = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset';

export function CallConnectBadges({ call }) {
  const c = CONNECT_STATES[call.status];
  if (!c) return null;
  const e = call.status === 'COMPLETED' ? ENDED_BY[call.ended_by] : null;
  const CIcon = c.icon;
  return (
    <>
      <span className={cn(pill, c.cls)} title={c.label === 'Connected' ? 'The customer answered the call' : 'The call did not connect'}>
        <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden /><CIcon className="h-3 w-3" aria-hidden />{c.label}
      </span>
      {e && (() => { const EIcon = e.icon; return <span className={cn(pill, e.cls)} title={e.title}><EIcon className="h-3 w-3" aria-hidden />{e.label}</span>; })()}
    </>
  );
}

export const duration = (s) => (s == null ? null : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);

export function CallItem({ call, onCancel, cancelling }) {
  const [showTranscript, setShowTranscript] = useState(false);
  const st = STATUS[call.status] || STATUS.FAILED;
  const Icon = st.icon;
  const answers = ANSWER_LABELS.filter(([k]) => call.answers?.[k]);
  const when = call.status === 'SCHEDULED' ? call.scheduled_at : call.started_at || call.created_at;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            st.variant === 'success' ? 'bg-emerald-50 text-emerald-600' : st.variant === 'warning' ? 'bg-amber-50 text-amber-600' : st.variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600')}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={st.variant}>{st.label}</Badge>
              <CallConnectBadges call={call} />
              {call.outcome_label && <Badge variant={OUTCOME_VARIANT[call.outcome] || 'secondary'}>{call.outcome_label}</Badge>}
              {call.provider === 'simulator' && <Badge variant="outline"><FlaskConical className="mr-1 h-3 w-3" />Simulated</Badge>}
            </div>
            <p className="mt-1 text-[12px] text-slate-500">
              {call.status === 'SCHEDULED' ? 'Calls ' : ''}{formatDateTime(when)} · attempt {call.attempt}
              {duration(call.duration_seconds) && ` · ${duration(call.duration_seconds)}`}
              {call.trigger_type === 'MANUAL' && ` · requested by ${call.created_by_name || 'a user'}`}
            </p>
          </div>
        </div>
        {call.status === 'SCHEDULED' && onCancel && (
          <Button size="sm" variant="outline" loading={cancelling} onClick={() => onCancel(call.id)}>Cancel</Button>
        )}
      </div>

      {(call.skip_label || call.error) && <p className="mt-2 text-[12.5px] text-slate-600">{call.skip_label || call.error}</p>}
      {call.summary && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{call.summary}</p>}

      {answers.length > 0 && (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-[12.5px] sm:grid-cols-2">
          {answers.map(([k, label]) => (
            <div key={k} className="flex gap-2"><dt className="shrink-0 text-slate-500">{label}:</dt><dd className="min-w-0 font-medium text-slate-800 [overflow-wrap:anywhere]">{String(call.answers[k])}</dd></div>
          ))}
        </dl>
      )}

      {/* has_recording is only true for Owner / Super Admin (the server hides it from everyone else). */}
      {call.has_recording && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls preload="none" src={`/api/crm/ai-calls/${call.id}/recording`} className="mt-3 h-10 w-full" aria-label="Call recording" />
      )}

      {call.transcript && (
        <div className="mt-2">
          <button type="button" onClick={() => setShowTranscript((v) => !v)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[hsl(var(--primary))] hover:underline" aria-expanded={showTranscript}>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTranscript && 'rotate-180')} />{showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-[12.5px] leading-relaxed text-slate-700">{call.transcript}</pre>}
        </div>
      )}
    </li>
  );
}

/** AI calls tab on the lead page: history, recordings, transcripts, answers, and "Call with AI now". */
export function AiCallsPanel({ leadId, hasPhone }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['lead', leadId, 'ai-calls'],
    queryFn: () => api(`/crm/leads/${leadId}/ai-calls`),
    // Poll while a call is queued or running so the result shows up without a reload.
    refetchInterval: (q) => (q.state.data?.calls?.some((c) => ['SCHEDULED', 'DIALING', 'IN_PROGRESS'].includes(c.status)) ? 10_000 : false),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['lead', leadId] }); };
  const start = useMutation({
    mutationFn: () => api(`/crm/leads/${leadId}/ai-calls`, { method: 'POST' }),
    onSuccess: (r) => { toast.success(r?.queuedForWindow ? `Outside calling hours. The call is queued for ${formatDateTime(r.scheduledAt)}.` : 'The AI agent will call in a few seconds.'); refresh(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id) => api(`/crm/ai-calls/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => { toast.success('Call cancelled'); refresh(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (isLoading) return <Card><CardContent className="space-y-3 pt-5"><Skeleton className="h-10" /><Skeleton className="h-24" /></CardContent></Card>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;

  const active = data.calls.some((c) => ['SCHEDULED', 'DIALING', 'IN_PROGRESS'].includes(c.status));
  const canStart = can('lead.edit') && data.canCall && hasPhone && !data.doNotCall && !active;
  const why = !hasPhone ? 'This lead has no phone number.' : data.doNotCall ? 'The customer asked not to be called.' : !data.canCall ? 'AI calling is not set up yet.' : active ? 'A call is already scheduled or in progress.' : null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[hsl(var(--primary))] ring-1 ring-slate-200"><Bot className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-slate-800">AI calling agent</p>
              <p className="text-[12px] text-slate-500">{why || 'Calls the customer, asks the project questions and saves the answers here.'}</p>
            </div>
          </div>
          {can('lead.edit') && (
            <Button size="sm" disabled={!canStart} loading={start.isPending}
              onClick={() => confirmAction({ title: 'Call this lead with the AI agent?', description: 'The agent introduces itself as an automated assistant, says the call is recorded, and asks the project questions.', confirmText: 'Call now' }, () => start.mutate())}>
              <PhoneCall />Call with AI now
            </Button>
          )}
        </div>

        {data.doNotCall && <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"><Ban className="h-4 w-4" />Do not call: the customer asked not to be contacted by the AI agent.</p>}

        {data.calls.length === 0 ? (
          <EmptyState icon={Bot} title="No AI calls yet" description="New leads are called automatically a few minutes after they arrive, when AI calling is switched on for this website." />
        ) : (
          <ul className="space-y-3">
            {data.calls.map((c) => (
              <CallItem key={c.id} call={c} cancelling={cancel.isPending && cancel.variables === c.id} onCancel={can('lead.edit') ? (id) => cancel.mutate(id) : null} />
            ))}
          </ul>
        )}
        {data.calls.length > 0 && <p className="text-[11.5px] text-slate-400">Last update {timeAgo(data.calls[0].created_at)}. Recordings are visible only to people who can see this lead.</p>}
      </CardContent>
    </Card>
  );
}
