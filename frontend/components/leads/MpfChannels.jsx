'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe2, X, Users2, FileText, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, toQuery } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { LeadsWorkspace } from '@/components/leads/LeadsWorkspace';
import { MetaLogo } from '@/components/integrations/MetaLogo';
import { MetaLeadFormsList, useMetaLeadForms } from '@/components/marketing/MetaLeadForms';
import { EmptyState } from '@/components/ui/feedback';

export function MetaNoAccess() {
  return <EmptyState title="No access to Meta leads" description="Ask a Super Admin to grant your role the “View Meta leads” permission (Super Admin → Roles)." />;
}

const WebsiteIcon = ({ className }) => (
  <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100', className)}><Globe2 className="h-5 w-5" /></span>
);

const CHANNELS = {
  website: { title: 'Website / App Leads', description: 'Enquiries from mypropertyfact.in, the app and manual entries. Meta leads are under Lead channels → Meta Leads.', Icon: WebsiteIcon, accent: 'border-t-teal-500' },
  meta: { title: 'Meta Leads', description: 'Facebook + Instagram lead form submissions, with campaign and form.', Icon: MetaLogo, accent: 'border-t-[#0082FB]' },
};

/** Page header for a channel: back link, logo + title, and (Meta) underline tabs Leads / Lead forms. */
function ChannelHeader({ channel, tab, tabs, standalone = false, eyebrow = null }) {
  const pathname = usePathname();
  const { title, description, Icon } = CHANNELS[channel];
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-3">
        {!standalone && (
          <Link href={pathname} aria-label="Back to MPF Leads" title="Back to MPF Leads"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[hsl(var(--primary))]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <Icon />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{eyebrow || (standalone ? 'Lead channel' : 'MPF Leads')}</p>
          <h1 className="truncate text-[17px] font-semibold leading-tight text-slate-900">{title}</h1>
          <p className="hidden truncate text-[12px] text-slate-500 sm:block">{description}</p>
        </div>
      </div>
      {tabs && (
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-2 [scrollbar-width:none]" aria-label={`${title} sections`}>
          {tabs.map((t) => (
            <Link key={t.key} href={t.href} scroll={false} aria-current={tab === t.key ? 'page' : undefined}
              className={cn('flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition',
                tab === t.key ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <t.icon className="h-4 w-4" />{t.label}
              {t.count != null && (
                <span className={cn('rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums', tab === t.key ? 'bg-[hsl(213_70%_94%)] text-[hsl(var(--primary))]' : 'bg-slate-100 text-slate-600')}>{t.count}</span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Meta channel view. Used inside MPF Leads (?channel=meta) and standalone at /crm/meta (sidebar). */
export function MetaChannel({ standalone = false }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const tab = params.get('tab') === 'forms' ? 'forms' : params.get('junk') === 'only' ? 'junk' : 'leads';
  const formId = params.get('formId');
  const { data: forms } = useMetaLeadForms();
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines', 'meta'], queryFn: () => api('/crm/pipelines?channel=meta'), staleTime: 60_000 });
  const { data: junkCount } = useQuery({
    queryKey: ['leads', 'channel', 'meta', 'junk'],
    queryFn: () => api(`/crm/leads${toQuery({ pipeline: 'mpf', channel: 'meta', junk: 'only', limit: 1 })}`).then((r) => r?.meta?.total ?? 0),
    staleTime: 60_000,
  });
  const form = formId ? forms?.find((f) => f.formId === formId) : null;
  const tabs = [
    { key: 'leads', label: 'Leads', icon: Users2, href: `${pathname}?channel=meta`, count: pipe?.counts?.mpf?.total },
    { key: 'junk', label: 'Junk & test', icon: ShieldAlert, href: `${pathname}?channel=meta&junk=only`, count: junkCount },
    { key: 'forms', label: 'Lead forms', icon: FileText, href: `${pathname}?channel=meta&tab=forms`, count: forms?.length },
  ];
  return (
    <>
      <ChannelHeader channel="meta" tab={tab} tabs={tabs} standalone={standalone} />
      {tab === 'forms' ? <Card className="overflow-hidden"><MetaLeadFormsList /></Card> : (
        <>
          {formId && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-[13px] text-blue-950">
              <span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">Form: <b>{form?.name || formId}</b></span></span>
              <Link href={`${pathname}?channel=meta`} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium hover:underline"><X className="h-3.5 w-3.5" />All Meta leads</Link>
            </div>
          )}
          {tab === 'junk' && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Meta leads flagged automatically: test leads (Meta&apos;s testing tool), repeat submissions within 24 hours, fake numbers, spam and internal entries. Each row shows the reason. They are kept here and never counted in the main numbers.</span>
            </p>
          )}
          <LeadsWorkspace key={`mpf-meta-${tab}-${formId || ''}`} pipelineKey="mpf" channel="meta" />
        </>
      )}
    </>
  );
}

/**
 * MPF Leads: Website / App leads only. Meta leads live in their own section (/crm/meta, sidebar → Lead channels).
 * Old MPF links to the Meta channel (?channel=meta, ?formId=…, ?tab=forms) are forwarded there.
 */
export function MpfChannels() {
  const params = useSearchParams();
  const router = useRouter();
  const isMetaLink = params.get('channel') === 'meta' || params.get('formId') || params.get('tab') === 'forms';

  useEffect(() => {
    if (!isMetaLink) return;
    const sp = new URLSearchParams(params.toString());
    sp.delete('channel');
    router.replace(`/crm/meta${sp.toString() ? `?${sp}` : ''}`);
  }, [isMetaLink, params, router]);

  if (isMetaLink) return null;
  return (
    <>
      <ChannelHeader channel="website" standalone eyebrow="MPF Leads" />
      <LeadsWorkspace key="mpf-website" pipelineKey="mpf" channel="website" />
    </>
  );
}
