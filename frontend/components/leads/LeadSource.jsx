import { Globe2, Handshake, Instagram } from 'lucide-react';
import { MetaMark } from '@/components/integrations/MetaLogo';
import { WEBSITE_LOGOS } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Where a lead came from, classified: Meta (with the Facebook Page, and Instagram when it came from IG),
 * Client (landing-page key / client Meta form, with the client name) or Website / App (with the brand).
 * Works with rows from /crm/leads and the dashboard "my leads" list.
 */
export function leadChannel(l) {
  if (l?.source_type === 'META') return 'meta';
  if (l?.source_type === 'LANDING_PAGE' || l?.source_type === 'META_FORM') return 'client';
  return 'website';
}

const isInstagram = (l) => /insta|^ig$/i.test(String(l?.source || l?.utm_source || ''));

export const CHANNEL_STYLE = {
  meta: { bar: 'bg-[#0866FF]', soft: 'bg-blue-50 text-blue-800 ring-blue-200', label: 'Meta' },
  client: { bar: 'bg-violet-500', soft: 'bg-violet-50 text-violet-800 ring-violet-200', label: 'Client' },
  website: { bar: 'bg-teal-500', soft: 'bg-teal-50 text-teal-800 ring-teal-200', label: 'Website' },
};

export function LeadSourceChip({ lead: l, className }) {
  const ch = leadChannel(l);
  const st = CHANNEL_STYLE[ch];
  const site = String(l?.website_code || '').toUpperCase();
  let icon; let primary; let secondary;
  if (ch === 'meta') {
    icon = isInstagram(l)
      ? <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[#f9ce34] via-[#ee2a7b] to-[#6228d7]"><Instagram className="h-2.5 w-2.5 text-white" /></span>
      : <MetaMark className="h-4 w-4" />;
    primary = isInstagram(l) ? 'Instagram' : 'Meta';
    secondary = l?.page_name || (l?.page_id ? `Page ${l.page_id}` : null);
  } else if (ch === 'client') {
    icon = <Handshake className="h-3.5 w-3.5 text-violet-600" />;
    primary = 'Client';
    secondary = l?.form_name || null;
  } else {
    icon = WEBSITE_LOGOS[site] ? <img src={WEBSITE_LOGOS[site]} alt="" className="h-4 w-4 object-contain" /> : <Globe2 className="h-3.5 w-3.5 text-teal-600" />;
    primary = site || 'Website';
    secondary = /app/i.test(String(l?.source || l?.form_type || '')) ? 'App' : 'Website';
  }
  return (
    <span className={cn('inline-flex max-w-[220px] items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2.5 text-[11.5px] ring-1 ring-inset', st.soft, className)} title={[primary, secondary].filter(Boolean).join(' · ')}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="shrink-0 font-semibold">{primary}</span>
      {secondary && <><span className="opacity-40">·</span><span className="truncate">{secondary}</span></>}
    </span>
  );
}
