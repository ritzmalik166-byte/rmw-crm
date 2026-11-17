'use client';
import { Suspense } from 'react';
import { MetaChannel, MetaNoAccess } from '@/components/leads/MpfChannels';
import { useAuth } from '@/providers/AuthProvider';

/** /crm/meta: Meta (Facebook + Instagram) leads. Needs the "View Meta leads" permission. */
export default function MetaLeadsPage() {
  const { can } = useAuth();
  if (!can('lead.channel.meta')) return <MetaNoAccess />;
  return <Suspense><MetaChannel standalone /></Suspense>;
}