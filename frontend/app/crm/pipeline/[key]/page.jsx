'use client';
import { Suspense, use } from 'react';
import { notFound } from 'next/navigation';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';
import { MpfChannels } from '@/components/leads/MpfChannels';
import { PIPELINES } from '@/lib/pipelines';
import { useAuth } from '@/providers/AuthProvider';
import { EmptyState } from '@/components/ui/feedback';

export default function PipelinePage({ params }) {
  const { key } = use(params);
  const { can } = useAuth();
  if (!PIPELINES[key] || key === 'all') notFound();
  if (key === 'career' && !can('career.view')) return <EmptyState title="No access" description="Ask a Super Admin to grant the “View career applications” permission to your role." />;
  if (key === 'mpf') return <Suspense><MpfChannels /></Suspense>;
  return <Suspense><LeadsWorkspace key={key} pipelineKey={key} /></Suspense>;
}
