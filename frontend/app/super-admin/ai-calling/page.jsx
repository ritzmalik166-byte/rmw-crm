'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, PhoneCall, PhoneMissed, Sparkles, Timer, CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, WebsiteBadge } from '@/components/ui/badge';
import { Switch, Checkbox } from '@/components/ui/controls';
import { ErrorState, PageHeader, Skeleton, StatCard, EmptyState } from '@/components/ui/feedback';

const STATUS_VARIANT = { COMPLETED: 'success', NO_ANSWER: 'warning', BUSY: 'warning', FAILED: 'danger', SCHEDULED: 'info', DIALING: 'info', IN_PROGRESS: 'info', CANCELLED: 'secondary', SKIPPED: 'secondary' };
const titleOf = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export default function AiCallingPage() {
  const { can } = useAuth();
  const canEdit = can('aicall.manage');
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['super-admin', 'ai-calling'], queryFn: () => api('/super-admin/ai-calling'), refetchInterval: 30_000 });
  const { data: pub } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config'), staleTime: 300_000 });
  const [f, setF] = useState(null);
  useEffect(() => { if (data && !f) setF({ ...data.config, questionsText: data.config.questions.join('\n'), retryText: data.config.retryMinutes.join(', ') }); }, [data, f]);

  const save = useMutation({
    mutationFn: () => {
      const { questionsText, retryText, ...rest } = f;
      return api('/super-admin/ai-calling', {
        method: 'PUT',
        body: {
          ...rest,
          delayMinutes: Number(rest.delayMinutes), maxAttempts: Number(rest.maxAttempts), recentCallDays: Number(rest.recentCallDays),
          questions: questionsText.split('\n').map((q) => q.trim()).filter(Boolean),
          retryMinutes: retryText.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0),
        },
      });
    },
    onSuccess: () => { toast.success('AI calling settings saved'); setF(null); qc.invalidateQueries({ queryKey: ['super-admin', 'ai-calling'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  if (isLoading || (data && !f)) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const provider = data.providers.find((p) => p.id === f.provider);
  const sum = (pred) => data.stats.filter(pred).reduce((n, s) => n + s.count, 0);
  const placed = sum((s) => ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED'].includes(s.status));
  const connected = sum((s) => s.status === 'COMPLETED');
  const interested = sum((s) => s.outcome === 'INTERESTED' || s.outcome === 'CALLBACK');
  const minutes = Math.round(data.stats.reduce((n, s) => n + s.seconds, 0) / 60);
  const toggleSite = (code) => set('websites')(f.websites.includes(code) ? f.websites.filter((c) => c !== code) : [...f.websites, code]);

  return (
    <>
      <PageHeader
        title="AI calling agent"
        description="Calls every new lead a few minutes after it arrives, asks the project questions, and saves the recording, transcript and answers on the lead."
        actions={canEdit && <Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Calls placed (30 days)" value={placed} icon={PhoneCall} />
        <StatCard label="Connected" value={connected} hint={placed ? `${Math.round((connected / placed) * 100)}% of calls` : undefined} icon={CheckCircle2} />
        <StatCard label="Interested or callback" value={interested} hint={connected ? `${Math.round((interested / connected) * 100)}% of connected` : undefined} icon={Sparkles} tone={interested ? 'success' : undefined} />
        <StatCard label="Talk time" value={`${minutes} min`} icon={Timer} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" />Settings</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <span>
                <span className="block text-[14px] font-semibold text-slate-800">Call new leads automatically</span>
                <span className="block text-[12.5px] text-slate-500">When off, nothing is called. &ldquo;Call with AI now&rdquo; on a lead still works once a provider is set up.</span>
              </span>
              <Switch disabled={!canEdit} checked={f.enabled} onCheckedChange={set('enabled')} aria-label="Call new leads automatically" />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Calling service">
                <Select disabled={!canEdit} value={f.provider} onChange={(e) => set('provider')(e.target.value)}>
                  {data.providers.map((p) => <option key={p.id} value={p.id}>{p.label}{p.configured ? '' : ' (not set up)'}</option>)}
                </Select>
              </Field>
              <Field label="Language">
                <Select disabled={!canEdit} value={f.language} onChange={(e) => set('language')(e.target.value)}>
                  <option value="hinglish">Hindi + English (follows the customer)</option><option value="hindi">Hindi</option><option value="english">English</option>
                </Select>
              </Field>
            </div>

            <Field label="Websites whose new leads are called">
              <div className="flex flex-wrap gap-2 pt-1">
                {(pub?.websites || []).map((w) => (
                  <label key={w.code} className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px]', f.websites.includes(w.code) ? 'border-primary bg-primary/5' : 'border-slate-200')}>
                    <Checkbox disabled={!canEdit} checked={f.websites.includes(w.code)} onCheckedChange={() => toggleSite(w.code)} /><WebsiteBadge code={w.code} />{w.name}
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Call after (minutes)" hint="From when the lead arrives"><Input disabled={!canEdit} type="number" min={1} max={1440} value={f.delayMinutes} onChange={(e) => set('delayMinutes')(e.target.value)} /></Field>
              <Field label="Calling from (IST)"><Input disabled={!canEdit} type="time" value={f.windowStart} onChange={(e) => set('windowStart')(e.target.value)} /></Field>
              <Field label="Calling until (IST)" hint="Leads after this are called next morning"><Input disabled={!canEdit} type="time" value={f.windowEnd} onChange={(e) => set('windowEnd')(e.target.value)} /></Field>
              <Field label="Attempts per lead"><Input disabled={!canEdit} type="number" min={1} max={5} value={f.maxAttempts} onChange={(e) => set('maxAttempts')(e.target.value)} /></Field>
              <Field label="Retry after (minutes)" hint="e.g. 30, 120"><Input disabled={!canEdit} value={f.retryText} onChange={(e) => set('retryText')(e.target.value)} /></Field>
              <Field label="Skip numbers called in last (days)" hint="Stops duplicate leads being called twice"><Input disabled={!canEdit} type="number" min={0} max={90} value={f.recentCallDays} onChange={(e) => set('recentCallDays')(e.target.value)} /></Field>
            </div>

            <label className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
              <Checkbox disabled={!canEdit} checked={f.skipIfWorked} onCheckedChange={(v) => set('skipIfWorked')(!!v)} />
              Don&apos;t call if a salesperson has already changed the status, added a note or booked a follow-up
            </label>

            <Field label="Opening line" hint="Placeholders: {name} {brand} {project} {city}. Keep the automated-assistant and recording disclosure.">
              <Textarea disabled={!canEdit} rows={3} value={f.openingLine} onChange={(e) => set('openingLine')(e.target.value)} maxLength={600} />
            </Field>
            <Field label="Questions the agent asks" hint="One per line, in order. Sent to the calling service with every call.">
              <Textarea disabled={!canEdit} rows={9} value={f.questionsText} onChange={(e) => set('questionsText')(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Setup status</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              {data.providers.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium text-slate-800">{p.id === 'simulator' && <FlaskConical className="h-3.5 w-3.5 text-slate-500" />}{p.label}</span>
                  {p.configured ? <Badge variant="success">Ready</Badge> : <Badge variant="warning" title={`Missing: ${p.missing.join(', ')}`}>Needs {p.missing.length} key{p.missing.length > 1 ? 's' : ''}</Badge>}
                </div>
              ))}
              {provider && !provider.configured && (
                <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>Add <b>{provider.missing.join(', ')}</b> to the backend <code>.env</code> and restart it before switching this on.</span></p>
              )}
              {f.provider === 'simulator' && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">The simulator never dials anyone. It writes a sample result about 8 seconds later so you can test the whole flow. Results are marked &ldquo;Simulated&rdquo;.</p>}
              <div className="border-t border-slate-100 pt-3">
                <p className="font-medium text-slate-800">Result webhook</p>
                <p className="mt-1 text-slate-500">Paste this in the calling service as the server / webhook URL, with {'{provider}'} replaced by <code>vapi</code> or <code>bolna</code>:</p>
                <code className="mt-2 block break-all rounded-lg bg-slate-100 px-2.5 py-2 text-[12px] text-slate-700">{data.webhook.urlTemplate}</code>
                {!data.webhook.secretConfigured && <p className="mt-2 text-[12.5px] text-red-700">AI_CALL_WEBHOOK_SECRET is not set, so results from real providers are refused.</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent calls</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!data.recent.length ? <EmptyState icon={PhoneMissed} title="No calls yet" /> : (
                <ul className="divide-y divide-slate-100">
                  {data.recent.slice(0, 15).map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] sm:px-5">
                      <span className="min-w-0">
                        <Link href={`/crm/leads/${c.lead_id}`} className="block truncate font-medium text-slate-800 hover:underline">{c.lead_name || 'Unnamed'}</Link>
                        <span className="text-[11.5px] text-slate-500">{c.website_code} · {formatDateTime(c.started_at || c.scheduled_at)}{c.provider === 'simulator' ? ' · simulated' : ''}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={STATUS_VARIANT[c.status] || 'secondary'}>{titleOf(c.status)}</Badge>
                        {c.outcome_label && <span className="text-[11.5px] text-slate-500">{c.outcome_label}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
