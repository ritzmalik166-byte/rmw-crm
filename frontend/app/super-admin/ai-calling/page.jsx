'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Power, PhoneCall, PhoneMissed, Sparkles, Timer, CheckCircle2, AlertTriangle, FlaskConical } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { formatDateTime, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, WebsiteBadge } from '@/components/ui/badge';
import { Switch, Checkbox } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState, PageHeader, Skeleton, StatCard, EmptyState } from '@/components/ui/feedback';

const STATUS_VARIANT = { COMPLETED: 'success', NO_ANSWER: 'warning', BUSY: 'warning', FAILED: 'danger', SCHEDULED: 'info', DIALING: 'info', IN_PROGRESS: 'info', CANCELLED: 'secondary', SKIPPED: 'secondary' };
const titleOf = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

/** Confirmation shown before switching AI calling ON: what will happen, blockers, and a consent tick. */
function TurnOnDialog({ open, onOpenChange, config, providers, loading, onConfirm }) {
  const [agree, setAgree] = useState(false);
  useEffect(() => { if (open) setAgree(false); }, [open]);
  const provider = providers.find((p) => p.id === config.provider);
  const notReady = provider && !provider.configured;
  const simulated = config.provider === 'simulator';
  const rows = [
    ['Calling service', provider?.label || config.provider],
    ['Automatic calls for new leads', config.enabled ? `On, ${config.delayMinutes} min after the lead arrives` : 'Off (only "Call with AI now")'],
    ['Websites', config.websites?.length ? config.websites.join(', ') : 'None selected'],
    ['Calling hours (IST)', `${config.windowStart} to ${config.windowEnd}`],
    ['Retries', `${config.maxAttempts} attempts${config.retryMinutes?.length ? `, after ${config.retryMinutes.join(' / ')} min` : ''}`],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <Power className="h-5 w-5" />
          </div>
          <DialogTitle>Turn ON AI calling?</DialogTitle>
          <DialogDescription>
            {simulated
              ? 'The Simulator is selected, so no one will actually be dialled. Results are sample data.'
              : 'The AI agent will start placing real phone calls to leads using these settings.'}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-medium text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>

        {notReady && (
          <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {provider.label} is not set up on the server (missing {provider.missing.join(', ')}). Calls will fail until its keys are added.
          </p>
        )}
        {simulated && (
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />Pick Bolna or Vapi and save settings first if you want real calls.
          </p>
        )}

        {!simulated && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-slate-50 p-3 text-[12.5px] text-slate-700">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>I confirm leads have consented to automated calls, and the questions and calling hours above are correct.</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={loading} disabled={(!simulated && !agree) || notReady} onClick={onConfirm}>
            <Power className="mr-1.5 h-4 w-4" />Turn ON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AiCallingPage() {
  const { can } = useAuth();
  const canEdit = can('aicall.manage');
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['super-admin', 'ai-calling'], queryFn: () => api('/super-admin/ai-calling'), refetchInterval: 30_000 });
  const { data: pub } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config'), staleTime: 300_000 });
  const [f, setF] = useState(null);
  const [onOpen, setOnOpen] = useState(false);
  useEffect(() => {
    if (data && !f) {
      const profiles = Object.fromEntries(Object.entries(data.config.profiles || {}).map(([code, p]) => [code, { agentId: p.agentId || '', openingLine: p.openingLine || '', questionsText: (p.questions || []).join('\n') }]));
      setF({ ...data.config, profiles, questionsText: data.config.questions.join('\n'), retryText: data.config.retryMinutes.join(', ') });
    }
  }, [data, f]);

  const save = useMutation({
    mutationFn: () => {
      const { questionsText, retryText, profiles, ...rest } = f;
      return api('/super-admin/ai-calling', {
        method: 'PUT',
        body: {
          ...rest,
          delayMinutes: Number(rest.delayMinutes), maxAttempts: Number(rest.maxAttempts), recentCallDays: Number(rest.recentCallDays),
          questions: questionsText.split('\n').map((q) => q.trim()).filter(Boolean),
          retryMinutes: retryText.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0),
          profiles: Object.fromEntries(Object.entries(profiles || {}).map(([code, p]) => [code, {
            agentId: p.agentId.trim(), openingLine: p.openingLine.trim(), questions: p.questionsText.split('\n').map((q) => q.trim()).filter(Boolean),
          }])),
        },
      });
    },
    onSuccess: () => { toast.success('AI calling settings saved'); setF(null); qc.invalidateQueries({ queryKey: ['super-admin', 'ai-calling'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const power = useMutation({
    mutationFn: (systemOn) => api('/super-admin/ai-calling', { method: 'PUT', body: { systemOn } }),
    onSuccess: (cfg) => {
      toast.success(cfg?.systemOn ? 'AI calling is ON' : 'AI calling is OFF. No calls will be placed.');
      setOnOpen(false); setF(null); qc.invalidateQueries({ queryKey: ['super-admin', 'ai-calling'] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const togglePower = () => {
    if (data.config.systemOn) {
      confirmAction({
        title: 'Switch OFF AI calling?',
        description: 'No calls will be placed (automatic, manual or retries) until you switch it back on. Queued calls will wait.',
        confirmText: 'Turn OFF',
        tone: 'danger',
      }, () => power.mutate(false));
    } else {
      setOnOpen(true);
    }
  };

  if (isLoading || (data && !f)) return <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const provider = data.providers.find((p) => p.id === f.provider);
  const sum = (pred) => data.stats.filter(pred).reduce((n, s) => n + s.count, 0);
  const placed = sum((s) => ['COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED'].includes(s.status));
  const connected = sum((s) => s.status === 'COMPLETED');
  const interested = sum((s) => s.outcome === 'INTERESTED' || s.outcome === 'CALLBACK');
  const minutes = Math.round(data.stats.reduce((n, s) => n + s.seconds, 0) / 60);
  const setProfile = (code, k) => (v) => setF((x) => ({ ...x, profiles: { ...x.profiles, [code]: { agentId: '', openingLine: '', questionsText: '', ...x.profiles?.[code], [k]: v } } }));
  const agentLabel = f.provider === 'vapi' ? 'Vapi assistant ID' : 'Bolna agent ID';
  const toggleSite = (code) => set('websites')(f.websites.includes(code) ? f.websites.filter((c) => c !== code) : [...f.websites, code]);

  return (
    <>
      <TurnOnDialog open={onOpen} onOpenChange={setOnOpen} config={data.config} providers={data.providers} loading={power.isPending} onConfirm={() => power.mutate(true)} />
      <PageHeader
        title="AI calling agent"
        description="Calls every new lead a few minutes after it arrives, asks the project questions, and saves the recording, transcript and answers on the lead."
        actions={canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={data.config.systemOn ? 'destructive' : 'default'}
              loading={power.isPending}
              onClick={togglePower}
              aria-pressed={data.config.systemOn}
            >
              <Power className="mr-1.5 h-4 w-4" />{data.config.systemOn ? 'Turn AI calling OFF' : 'Turn AI calling ON'}
            </Button>
            <Button variant="outline" loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
          </div>
        )}
      />

      <div
        role="status"
        className={cn('mb-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium',
          data.config.systemOn ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800')}
      >
        <span className={cn('h-2.5 w-2.5 rounded-full', data.config.systemOn ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden />
        {data.config.systemOn
          ? 'AI calling system is ON. Calls are placed according to the settings below.'
          : 'AI calling system is OFF. No calls are placed. Queued calls wait and go out when it is switched back on.'}
      </div>

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
            <Field label="Default questions" hint="One per line, in order. Used for any website that has no script of its own below.">
              <Textarea disabled={!canEdit} rows={9} value={f.questionsText} onChange={(e) => set('questionsText')(e.target.value)} />
            </Field>

            <div className="space-y-3 border-t border-slate-100 pt-5">
              <div>
                <p className="text-[14px] font-semibold text-slate-800">Script per website</p>
                <p className="text-[12.5px] text-slate-500">Each business can use its own agent (prompt, voice, answer fields) and its own questions. Leave a box empty to use the default above.</p>
              </div>
              {f.websites.length === 0 && <p className="text-[13px] text-slate-500">Tick a website above to give it its own script.</p>}
              {f.websites.map((code) => {
                const p = f.profiles?.[code] || { agentId: '', openingLine: '', questionsText: '' };
                const site = (pub?.websites || []).find((w) => w.code === code);
                return (
                  <details key={code} className="group rounded-xl border border-slate-200 bg-white" open={Boolean(p.agentId || p.questionsText)}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
                      <span className="flex items-center gap-2 text-[13.5px] font-medium text-slate-800"><WebsiteBadge code={code} />{site?.name || code}</span>
                      <span className="text-[12px] text-slate-500">{p.agentId ? 'Own agent' : 'Default agent'} · {p.questionsText.trim() ? 'own questions' : 'default questions'}</span>
                    </summary>
                    <div className="space-y-4 border-t border-slate-100 p-3.5">
                      <Field label={agentLabel} hint={`Leave empty to use the agent in the server .env (${f.provider === 'vapi' ? 'VAPI_ASSISTANT_ID' : 'BOLNA_AGENT_ID'}).`}>
                        <Input disabled={!canEdit} value={p.agentId} onChange={(e) => setProfile(code, 'agentId')(e.target.value)} placeholder="e.g. 49fdcd4d-10ca-4ea5-83a4-72d67da51c0c" className="font-mono" />
                      </Field>
                      <Field label="Opening line" hint="Placeholders: {name} {brand} {project} {city}. Empty = default.">
                        <Textarea disabled={!canEdit} rows={2} value={p.openingLine} onChange={(e) => setProfile(code, 'openingLine')(e.target.value)} maxLength={600} />
                      </Field>
                      <Field label="Questions" hint="One per line. Empty = default questions.">
                        <Textarea disabled={!canEdit} rows={7} value={p.questionsText} onChange={(e) => setProfile(code, 'questionsText')(e.target.value)} />
                      </Field>
                    </div>
                  </details>
                );
              })}
            </div>
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
