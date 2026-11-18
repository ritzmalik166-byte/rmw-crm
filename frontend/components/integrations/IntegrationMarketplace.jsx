'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Check, ArrowRight } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WhatsAppIcon } from '@/components/leads/LeadsWorkspace';
import { MetaLogo } from './MetaLogo';

/** Opens the Meta card's Pages dialog (MetaIntegrationCard listens for it). */
export const META_OPEN_PAGES_EVENT = 'meta:open-pages';

const Tile = ({ bg, children }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ background: bg }}>{children}</span>
);

/** Catalog. `live` providers work today; the rest are listed so the team can see what is planned. */
const CATALOG = [
  { key: 'META', name: 'Meta', desc: 'Facebook + Instagram Lead Ads, all Pages in one login', category: 'Ads', live: true, icon: <MetaLogo /> },
  { key: 'WHATSAPP', name: 'WhatsApp Business', desc: 'Chats become leads; reply and send templates', category: 'Messaging', icon: <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white"><WhatsAppIcon className="h-5 w-5" /></span> },
  { key: 'LINKEDIN', name: 'LinkedIn Lead Gen', desc: 'Lead Gen Form submissions from LinkedIn ads', category: 'Ads', icon: <Tile bg="#0A66C2">in</Tile> },
  { key: 'GOOGLE_ADS', name: 'Google Ads', desc: 'Lead form extensions from Search, YouTube and Discovery', category: 'Ads', icon: <Tile bg="#4285F4">G</Tile> },
  { key: '99ACRES', name: '99acres', desc: 'Property enquiries from your 99acres listings', category: 'Marketplace', icon: <Tile bg="#0078DB">99</Tile> },
  { key: 'MAGICBRICKS', name: 'MagicBricks', desc: 'Buyer and tenant enquiries from MagicBricks', category: 'Marketplace', icon: <Tile bg="#D8232A">MB</Tile> },
  { key: 'HOUSING', name: 'Housing.com', desc: 'Leads from Housing.com project and listing pages', category: 'Marketplace', icon: <Tile bg="#5E23DC">H</Tile> },
  { key: 'INDIAMART', name: 'IndiaMART', desc: 'Buy leads and enquiries from IndiaMART', category: 'Marketplace', icon: <Tile bg="#2E3192">IM</Tile> },
  { key: 'JUSTDIAL', name: 'Justdial', desc: 'Business enquiries from your Justdial listing', category: 'Marketplace', icon: <Tile bg="#FF6E00">JD</Tile> },
  { key: 'WEBHOOK', name: 'Zapier / Make / Webhook', desc: 'Push leads from any tool with a secure URL', category: 'Other', icon: <Tile bg="#475569">{'{ }'}</Tile> },
];
const CATEGORIES = ['All', 'Ads', 'Messaging', 'Marketplace', 'Other'];

/** onManageMeta: what "Manage Pages" does when Meta is connected (default: open the Meta card's Pages dialog on this screen). */
export function IntegrationMarketplace({ open, onOpenChange, onManageMeta }) {
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const status = useQuery({ queryKey: ['meta', 'status'], queryFn: () => api('/manage/integrations/meta/status'), enabled: open });
  const metaConnected = status.data && !['NOT_CONNECTED', 'NOT_CONFIGURED'].includes(status.data.state);

  const connect = useMutation({
    mutationFn: () => api('/manage/integrations/meta/connect', { method: 'POST' }),
    onSuccess: (r) => window.location.assign(r.url),
    onError: (e) => toast.error(apiMessage(e)),
  });

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return CATALOG.filter((i) => (cat === 'All' || i.category === cat) && (!s || `${i.name} ${i.desc}`.toLowerCase().includes(s)));
  }, [search, cat]);

  const choose = (item) => {
    if (!item.live) { toast.info(`${item.name} is coming soon. We'll enable it here as soon as it's ready.`); return; }
    if (item.key === 'META') {
      if (status.data?.state === 'NOT_CONFIGURED') { toast.error(`Meta is not configured on the server: ${status.data.missingConfig.join(', ')}`); return; }
      if (metaConnected) {
        onOpenChange(false);
        if (onManageMeta) onManageMeta(); else window.dispatchEvent(new Event(META_OPEN_PAGES_EVENT));
        return;
      }
      connect.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add integration</DialogTitle>
          <DialogDescription>Connect a lead source. Every lead goes into the same CRM pipelines, assignment and notifications.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-8" placeholder="Search integrations" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" onClick={() => setCat(c)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium ${cat === c ? 'bg-[hsl(var(--primary))] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
        </div>
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {list.map((i) => {
            const connected = i.key === 'META' && metaConnected;
            return (
              <button key={i.key} type="button" onClick={() => choose(i)} disabled={i.key === 'META' && connect.isPending}
                className={`group flex items-start gap-3 rounded-lg border p-3 text-left transition ${i.live ? 'hover:border-blue-300 hover:bg-blue-50/40' : 'opacity-70 hover:bg-slate-50'}`}>
                {i.icon}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-slate-900">{i.name}</span>
                    {connected ? <Badge variant="success"><Check className="mr-0.5 h-3 w-3" />Connected</Badge>
                      : i.live ? <Badge variant="info">Available</Badge> : <Badge variant="secondary">Coming soon</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-slate-500">{i.desc}</span>
                  {i.live && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-blue-700 group-hover:underline">
                      {connected ? 'Manage Pages' : connect.isPending ? 'Opening Facebook…' : 'Connect'}<ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
