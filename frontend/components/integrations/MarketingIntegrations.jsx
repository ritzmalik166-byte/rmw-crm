'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WhatsAppIcon } from '@/components/leads/LeadsWorkspace';
import { IntegrationStatus } from './IntegrationStatus';
import { MetaIntegrationCard } from './MetaIntegrationCard';

const ICONS = {
  WHATSAPP: <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white"><WhatsAppIcon className="h-5 w-5" /></span>,
};
const CTA = { WHATSAPP: 'Connect WhatsApp' };

/** Provider not built yet: same card frame, disabled action. */
function UpcomingProviderCard({ provider }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {ICONS[provider.key]}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-slate-900">{provider.name}</p>
            <p className="truncate text-[12px] text-slate-500">{provider.description}</p>
          </div>
        </div>
        <IntegrationStatus state="COMING_SOON" />
      </div>
      <p className="mt-3 flex-1 text-[13px] text-slate-500">Leads from {provider.name} will flow into the same CRM pipeline, assignment and notifications as Meta leads.</p>
      <div className="mt-4 border-t pt-3"><Button variant="outline" disabled title="Not available yet">{CTA[provider.key] || 'Connect'}</Button></div>
    </Card>
  );
}

/** "Marketing integrations" section of the Integrations page. */
export function MarketingIntegrations({ canManage }) {
  const providers = useQuery({ queryKey: ['meta', 'providers'], queryFn: () => api('/admin/integrations/providers'), staleTime: 5 * 60_000 });
  const others = (providers.data || []).filter((p) => p.key !== 'META');
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-600">Marketing integrations</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetaIntegrationCard canManage={canManage} />
        {others.map((p) => <UpcomingProviderCard key={p.key} provider={p} />)}
      </div>
    </section>
  );
}
