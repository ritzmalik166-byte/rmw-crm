'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, Clock, FlaskConical, Headphones, Phone, Search, ThumbsUp, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge, WebsiteLogo } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';
import { ANSWER_LABELS, OUTCOME_VARIANT, STATUS, duration } from '@/components/leads/AiCalls';
import { WaveformPlayer } from '@/components/leads/WaveformPlayer';
import { formatDateTime, cn } from '@/lib/utils';

const ORDER = ['RMW', 'MPF', 'CT', 'CTMPL'];
const FALLBACK_NAMES = { RMW: 'Ritz Media World', MPF: 'MyPropertyFact', CT: 'Contenaissance', CTMPL: 'Creative Thinks Media' };
const OUTCOMES = [
  ['', 'All outcomes'], ['INTERESTED', 'Interested'], ['CALLBACK', 'Call back'], ['NOT_INTERESTED', 'Not interested'],
  ['WRONG_NUMBER', 'Wrong number'], ['DO_NOT_CALL', 'Do not call'], ['UNCLEAR', 'Unclear'],
];

const talkTime = (secs) => {
  if (!secs) return '0m';
  const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = secs % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
};
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}><Icon className="h-4 w-4" /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-[17px] font-semibold tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
  );
}

/* ---------- Step 1: pick a website ---------- */
function WebsitePicker({ websites, onPick }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {websites.map((w) => (
        <button
          key={w.code}
          type="button"
          onClick={() => onPick(w.code)}
          className="group flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[hsl(var(--primary))]/50 hover:shadow-lg"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100 transition-colors group-hover:bg-[hsl(var(--primary))]/5">
            <WebsiteLogo code={w.code} className="h-16 w-16" />
          </span>
          <span>
            <span className="block text-[16px] font-semibold text-slate-900">{w.name || w.code}</span>
            <span className="mt-0.5 block text-[12px] font-semibold tracking-widest text-slate-400">{w.code}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[12.5px] font-medium text-slate-700 group-hover:bg-[hsl(var(--primary))] group-hover:text-white">
            <Headphones className="h-3.5 w-3.5" />{w.count} recording{w.count === 1 ? '' : 's'}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- Step 2: people list ---------- */
function PersonRow({ call, active, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active || undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          active ? 'bg-[hsl(var(--primary))]/10 ring-1 ring-[hsl(var(--primary))]/30' : 'hover:bg-slate-50',
        )}
      >
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold',
          active ? 'bg-[hsl(var(--primary))] text-white' : 'bg-slate-100 text-slate-600')}>
          {initial(call.lead_name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-semibold text-slate-900">{call.lead_name || `Lead #${call.lead_id}`}</span>
            <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{duration(call.duration_seconds)}</span>
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-slate-500">{formatDateTime(call.started_at || call.created_at)}</span>
            {call.outcome_label && <Badge variant={OUTCOME_VARIANT[call.outcome] || 'secondary'} className="shrink-0 text-[10.5px]">{call.outcome_label}</Badge>}
          </span>
        </span>
        <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-300', active && 'text-[hsl(var(--primary))]')} />
      </button>
    </li>
  );
}

/* ---------- Step 3: summary + recording ---------- */
function CallDetail({ call }) {
  const [showTranscript, setShowTranscript] = useState(false);
  useEffect(() => setShowTranscript(false), [call.id]);
  const st = STATUS[call.status] || STATUS.FAILED;
  const answers = ANSWER_LABELS.filter(([k]) => call.answers?.[k]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[18px] font-semibold text-white shadow">
            {initial(call.lead_name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-semibold text-slate-900">{call.lead_name || `Lead #${call.lead_id}`}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-500">
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{call.to_phone}</span>
              <span>{formatDateTime(call.started_at || call.created_at)}</span>
              <span>attempt {call.attempt}</span>
            </p>
          </div>
        </div>
        <Link href={`/crm/leads/${call.lead_id}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50">
          Open lead<ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant={st.variant}>{st.label}</Badge>
        {call.outcome_label && <Badge variant={OUTCOME_VARIANT[call.outcome] || 'secondary'}>{call.outcome_label}</Badge>}
        {call.provider === 'simulator' && <Badge variant="outline"><FlaskConical className="mr-1 h-3 w-3" />Simulated</Badge>}
      </div>

      {call.has_recording ? (
        <WaveformPlayer
          key={call.id}
          src={`/api/crm/ai-calls/${call.id}/recording`}
          initialDuration={call.duration_seconds}
          fileName={`${call.website_code || 'call'}-${call.lead_name || `lead-${call.lead_id}`}-${String(call.started_at || call.created_at || '').slice(0, 10)}`}
          shareTitle={`AI call recording: ${call.lead_name || `Lead #${call.lead_id}`}${call.website_name ? ` (${call.website_name})` : ''}`}
          shareText={call.summary || ''}
          shareUrl={typeof window !== 'undefined' ? `${window.location.origin}/crm/leads/${call.lead_id}` : undefined}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[12.5px] text-slate-500">No recording for this call.</p>
      )}

      {call.summary && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-slate-700">{call.summary}</p>
        </section>
      )}

      {answers.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">Answers</h3>
          <dl className="grid gap-2 sm:grid-cols-2">
            {answers.map(([k, label]) => (
              <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-[11.5px] text-slate-500">{label}</dt>
                <dd className="text-[13px] font-medium text-slate-800 [overflow-wrap:anywhere]">{String(call.answers[k])}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {call.transcript && (
        <section>
          <button type="button" onClick={() => setShowTranscript((v) => !v)} aria-expanded={showTranscript}
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[hsl(var(--primary))] hover:underline">
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTranscript && 'rotate-180')} />{showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && (
            <div className="mt-2 max-h-96 space-y-2 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {call.transcript.split('\n').filter(Boolean).map((line, i) => {
                const m = line.match(/^(Agent|AI|Assistant|Bot|Customer|User)\s*:\s*(.*)$/i);
                const agent = m && /^(agent|ai|assistant|bot)$/i.test(m[1]);
                return (
                  <div key={i} className={cn('flex', m && !agent && 'justify-end')}>
                    <p className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed',
                      !m ? 'text-slate-600' : agent ? 'rounded-tl-sm bg-white text-slate-700 ring-1 ring-slate-200' : 'rounded-tr-sm bg-[hsl(var(--primary))] text-white')}>
                      {m && <span className="mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{agent ? 'AI agent' : 'Customer'}</span>}
                      {m ? m[2] : line}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Super Admin → Call recordings: pick a website, then a person, then listen. Owner and Super Admin only. */
export default function CallRecordingsPage() {
  const [website, setWebsite] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set('q', q);
  if (outcome) params.set('outcome', outcome);
  if (website) params.set('website', website);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['super-admin', 'call-recordings', page, q, outcome, website],
    queryFn: () => api(`/super-admin/ai-call-recordings?${params}`),
    placeholderData: keepPreviousData,
  });

  const websites = useMemo(() => {
    // Always show the four websites, even if the API sent no counts (e.g. an older backend still running).
    const fromApi = data?.websites || [];
    const list = [...fromApi, ...ORDER.filter((c) => !fromApi.some((w) => w.code === c)).map((code) => ({ code, name: FALLBACK_NAMES[code], count: 0 }))];
    return list.sort((a, b) => (ORDER.indexOf(a.code) + 1 || 99) - (ORDER.indexOf(b.code) + 1 || 99));
  }, [data?.websites]);
  const current = websites.find((w) => w.code === website);
  const calls = data?.calls || [];
  const selected = calls.find((c) => c.id === selectedId) || calls[0] || null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const s = data?.summary;

  const pickWebsite = (code) => { setWebsite(code); setPage(1); setSelectedId(null); setSearch(''); setQ(''); setOutcome(''); };

  if (isError) return (<div><PageHeader title="Call recordings" /><Card><ErrorState error={error} onRetry={refetch} /></Card></div>);

  /* Step 1 */
  if (!website) {
    return (
      <div>
        <PageHeader title="Call recordings" description="Choose a website to listen to the AI agent's calls. Only the Owner and Super Admins can see this page." />
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{ORDER.map((c) => <Skeleton key={c} className="h-64 rounded-2xl" />)}</div>
        ) : <WebsitePicker websites={websites} onPick={pickWebsite} />}
      </div>
    );
  }

  /* Steps 2 + 3 */
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => pickWebsite('')} aria-label="Back to websites"><ArrowLeft className="h-4 w-4" /></Button>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200"><WebsiteLogo code={website} className="h-7 w-7" /></span>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">{current?.name || website}</h1>
            <p className="text-[12.5px] text-slate-500">Call recordings</p>
          </div>
        </div>
        {/* Quick switch between websites */}
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {websites.map((w) => (
            <button key={w.code} type="button" onClick={() => pickWebsite(w.code)} aria-pressed={w.code === website}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                w.code === website ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
              <WebsiteLogo code={w.code} className="h-4 w-4" />{w.code}
              <span className="text-[11px] font-medium tabular-nums text-slate-400">{w.count}</span>
            </button>
          ))}
        </div>
      </div>

      {s && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Headphones} label="Recordings" value={s.calls} tone="bg-indigo-50 text-indigo-600" />
          <Stat icon={Clock} label="Talk time" value={talkTime(s.seconds)} tone="bg-sky-50 text-sky-600" />
          <Stat icon={ThumbsUp} label="Interested / call back" value={s.positive} tone="bg-emerald-50 text-emerald-600" />
          <Stat icon={Users} label="Leads reached" value={s.leads} tone="bg-amber-50 text-amber-600" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* People */}
        <Card className="flex max-h-[calc(100vh-14rem)] min-h-[320px] flex-col overflow-hidden">
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="pl-9 lg:pl-9" aria-label="Search recordings" />
            </div>
            <Select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); setSelectedId(null); }} aria-label="Filter by outcome">
              {OUTCOMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </Select>
          </div>
          <div className={cn('flex-1 overflow-y-auto p-2 transition-opacity', isFetching && 'opacity-70')}>
            {isLoading ? (
              <div className="space-y-2 p-1">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : !calls.length ? (
              <EmptyState icon={Headphones} title="No recordings" description={q || outcome ? 'Nothing matches these filters.' : 'No calls recorded for this website yet.'} />
            ) : (
              <ul className="space-y-1">
                {calls.map((c) => <PersonRow key={c.id} call={c} active={selected?.id === c.id} onClick={() => setSelectedId(c.id)} />)}
              </ul>
            )}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 p-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setSelectedId(null); }}>Previous</Button>
              <span className="text-[12px] text-slate-500">{page} / {pages}</span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => { setPage((p) => p + 1); setSelectedId(null); }}>Next</Button>
            </div>
          )}
        </Card>

        {/* Detail */}
        <Card className="p-5">
          {selected ? <CallDetail call={selected} /> : (
            <EmptyState icon={Headphones} title="Pick a person" description="Choose someone on the left to see the summary and play the recording." />
          )}
        </Card>
      </div>
    </div>
  );
}
