import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { fmtNum } from './MetaOverview';

/** Meta Leads -> Contacted -> Qualified -> Site visit -> Negotiation -> Converted, with step and overall %. */
export function ConversionFunnel({ funnel }) {
  const top = funnel?.[0]?.count || 0;
  return (
    <Card>
      <CardHeader><CardTitle>Lead funnel</CardTitle></CardHeader>
      <CardContent>
        {!top ? <EmptyState title="No Meta leads in this period" /> : (
          <ol className="space-y-1" aria-label="Lead funnel">
            {funnel.map((s, i) => (
              <li key={s.key}>
                {i > 0 && (
                  <p className="flex items-center gap-1 py-0.5 pl-1 text-[11px] text-slate-500"><ChevronDown className="h-3 w-3" />{s.pctOfPrevious}% of {funnel[i - 1].label.toLowerCase()}</p>
                )}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-[13px] text-slate-600">{s.label}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div className="flex h-full items-center rounded-md bg-[hsl(var(--primary))] px-2 text-[12px] font-semibold text-white transition-all" style={{ width: `${Math.max(s.pctOfTotal, s.count ? 6 : 0)}%`, opacity: 1 - i * 0.1 }}>
                      {s.count ? fmtNum(s.count) : ''}
                    </div>
                  </div>
                  <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-slate-500">{s.pctOfTotal}%</span>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-[11px] text-slate-400">A lead counts at every stage it has reached, even if it later moved to Lost.</p>
      </CardContent>
    </Card>
  );
}
