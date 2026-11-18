'use client';
import { useAuth } from '@/providers/AuthProvider';
import { EmptyState, PageHeader } from '@/components/ui/feedback';
import { MarketingIntegrations } from '@/components/integrations/MarketingIntegrations';

/** /crm/integrations: connect Meta and other lead sources from the CRM home. Needs "Manage integrations". */
export default function CrmIntegrationsPage() {
  const { can } = useAuth();
  const canManage = can('integration.manage');
  if (!canManage && !can('integration.view')) {
    return <EmptyState title="No access to integrations" description="Ask a Super Admin to grant you the “Manage integrations” permission (Super Admin → Roles or Permissions)." />;
  }
  return (
    <>
      <PageHeader title="Integrations" description="Connect Meta, WhatsApp and other lead sources. New leads arrive in your CRM pipelines automatically." />
      <MarketingIntegrations canManage={canManage} />
    </>
  );
}
