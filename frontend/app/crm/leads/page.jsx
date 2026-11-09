'use client';
import { Suspense } from 'react';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';

export default function LeadsPage() {
  return <Suspense><LeadsWorkspace pipelineKey="all" /></Suspense>;
}
