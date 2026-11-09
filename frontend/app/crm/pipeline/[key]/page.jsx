'use client';
import { Suspense, use } from 'react';
import { notFound } from 'next/navigation';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';
import { PIPELINES } from '@/lib/pipelines';

export default function PipelinePage({ params }) {
  const { key } = use(params);
  if (!PIPELINES[key] || key === 'all') notFound();
  // key prop resets filters/selection when switching pipelines
  return <Suspense><LeadsWorkspace key={key} pipelineKey={key} /></Suspense>;
}
