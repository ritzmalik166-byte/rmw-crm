'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Headphones, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { WebsiteBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';
import { CallItem } from '@/components/leads/AiCalls';

const OUTCOMES = [
  ['', 'All outcomes'],
  ['INTERESTED', 'Interested'],
  ['CALLBACK', 'Call back'],
  ['NOT_INTERESTED', 'Not interested'],
  ['WRONG_NUMBER', 'Wrong number'],
  ['DO_NOT_CALL', 'Do not call'],
  ['UNCLEAR', 'Unclear'],
];

/** Super Admin → Call recordings: every AI call recording (agent ↔ customer). Owner and Super Admin only. */
export default function CallRecordingsPage() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);

  // Search after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ page: String(page) });
  if (q) params.set('q', q);
  if (outcome) params.set('outcome', outcome);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['super-admin', 'call-recordings', page, q, outcome],
    queryFn: () => api(`/super-admin/ai-call-recordings?${params}`),
    placeholderData: keepPreviousData,
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHeader
        title="Call recordings"
        description="Listen to the AI agent's calls with leads. Only the Owner and Super Admins can see this page."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by lead name or phone" className="pl-9" aria-label="Search recordings" />
        </div>
        <Select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }} aria-label="Filter by outcome" className="sm:w-52">
          {OUTCOMES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : isError ? (
        <Card><ErrorState error={error} onRetry={refetch} /></Card>
      ) : !data.calls.length ? (
        <Card>
          <EmptyState
            icon={Headphones}
            title="No recordings yet"
            description={q || outcome ? 'No recordings match these filters.' : 'Recordings appear here after the AI agent completes a call.'}
          />
        </Card>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-slate-500">{data.total} recording{data.total === 1 ? '' : 's'}</p>
          <ul className={`space-y-3 ${isFetching ? 'opacity-70' : ''}`}>
            {data.calls.map((call) => (
              <li key={call.id}>
                <Card>
                  <CardContent className="pt-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                      <WebsiteBadge code={call.website_code} />
                      <Link href={`/crm/leads/${call.lead_id}`} className="font-semibold text-slate-800 hover:underline">
                        {call.lead_name || `Lead #${call.lead_id}`}
                      </Link>
                      <span className="text-slate-500">{call.to_phone}</span>
                    </div>
                    <ul><CallItem call={call} /></ul>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-[12.5px] text-slate-500">Page {page} of {pages}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
