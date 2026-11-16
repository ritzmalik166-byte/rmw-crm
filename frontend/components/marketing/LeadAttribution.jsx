'use client';
import { useState } from 'react';
import { ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn, formatDateTime, titleCase } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetaLogo } from '@/components/integrations/MetaIntegrationCard';

const parse = (v, d) => { if (v == null) return d; if (typeof v !== 'string') return v; try { return JSON.parse(v) ?? d; } catch { return d; } };
const STANDARD = new Set(['full_name', 'first_name', 'last_name', 'email', 'work_email', 'phone_number', 'work_phone_number']);

function Row({ label, value, mono }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-3 py-2 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('min-w-0 break-words text-slate-800', mono && 'font-mono text-xs')}>{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function IdRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
      <span className="text-slate-500">{label}</span>
      {value ? (
        <button type="button" className="flex min-w-0 items-center gap-1 font-mono text-slate-700 hover:text-[hsl(var(--primary))]" title="Copy"
          onClick={() => navigator.clipboard?.writeText(String(value)).then(() => toast.success(`${label} copied`))}>
          <span className="truncate">{value}</span><Copy className="h-3 w-3 shrink-0" />
        </button>
      ) : <span className="text-slate-400">—</span>}
    </div>
  );
}

/** Source card for Meta leads: form answers and campaign for sales, Meta IDs under a collapsed "Technical details". */
export function LeadAttribution({ lead }) {
  const [open, setOpen] = useState(false);
  const meta = parse(lead.external_metadata, {});
  const answers = meta.formResponses || {};
  const order = meta.responseOrder?.length ? meta.responseOrder : Object.keys(answers).map((key) => ({ key, label: titleCase(key) }));
  const custom = order.filter((q) => !STANDARD.has(q.key) && answers[q.key]);
  const platform = meta.platform === 'instagram' ? 'Instagram' : 'Facebook';
  const conversions = lead.conversions || [];

  return (
    <Card>
      <CardHeader><CardTitle>Source</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5">
          <MetaLogo />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-blue-950">Meta Ads · {platform}</p>
            <p className="text-[12px] text-blue-900/80">{meta.isOrganic ? 'Organic lead form submission' : 'Lead form from a paid ad'}</p>
          </div>
        </div>

        {custom.length > 0 && (
          <div>
            <p className="kv-label mb-1">Form answers</p>
            <dl className="divide-y divide-slate-100">{custom.map((q) => <Row key={q.key} label={q.label} value={answers[q.key]} />)}</dl>
          </div>
        )}

        <dl className="divide-y divide-slate-100 border-t border-slate-100">
          <Row label="Campaign" value={lead.campaign_name} />
          <Row label="Ad set" value={lead.ad_set_name} />
          <Row label="Ad" value={lead.ad_name} />
          <Row label="Form" value={lead.form_name} />
        </dl>

        {conversions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conversions.map((c) => <Badge key={c.conversion_type} variant="success" title={formatDateTime(c.conversion_date)}>{titleCase(c.conversion_type)}</Badge>)}
          </div>
        )}

        <div className="rounded-lg border border-slate-200">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
            Technical details<ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <div className="divide-y divide-slate-100 border-t px-3 pb-1">
              <IdRow label="Lead ID" value={lead.source_lead_id} />
              <IdRow label="Campaign ID" value={lead.campaign_id} />
              <IdRow label="Ad set ID" value={lead.ad_set_id} />
              <IdRow label="Ad ID" value={lead.ad_id} />
              <IdRow label="Form ID" value={lead.form_id} />
              <IdRow label="Page ID" value={lead.page_id} />
              {lead.instagram_account_id && <IdRow label="Instagram ID" value={lead.instagram_account_id} />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
