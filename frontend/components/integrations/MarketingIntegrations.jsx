'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MetaIntegrationCard } from './MetaIntegrationCard';
import { IntegrationMarketplace } from './IntegrationMarketplace';

/**
 * "Marketing integrations" section: connected integrations as cards, plus "Add integration" (header button and a
 * dashed tile) that opens the marketplace. Used on the Super Admin Integrations page and the CRM home Integrations page.
 */
export function MarketingIntegrations({ canManage }) {
  const [market, setMarket] = useState(false);
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-600">Marketing integrations</h2>
        {canManage && <Button size="sm" onClick={() => setMarket(true)}><Plus />Add integration</Button>}
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <MetaIntegrationCard canManage={canManage} />
        {canManage && (
          <button type="button" onClick={() => setMarket(true)}
            className="flex min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-xl p-4 text-center border-2 border-dashed border-slate-300 text-slate-500 transition hover:border-blue-400 hover:bg-blue-50/40 hover:text-blue-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><Plus className="h-5 w-5" /></span>
            <span className="text-[14px] font-medium">Add integration</span>
            <span className="text-[12px]">WhatsApp, LinkedIn, Google Ads, 99acres, MagicBricks and more</span>
          </button>
        )}
      </div>
      {market && <IntegrationMarketplace open onOpenChange={setMarket} />}
    </section>
  );
}
