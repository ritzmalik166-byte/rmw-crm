import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtMoney, fmtNum } from './MetaOverview';

const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');

/** Campaign | Leads | Qualified | Site visits | Converted | Spend | CPL. Click a row to filter by campaign. */
export function CampaignPerformance({ rows, spendAvailable, onSelect, selectedId }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Campaign performance</CardTitle></CardHeader>
      {!rows?.length ? <EmptyState title="No campaigns in this period" /> : (
        <>
        <ul className="divide-y md:hidden">
          {rows.map((r) => (
            <li key={r.campaignId || 'none'}>
              <button type="button" disabled={!r.campaignId} onClick={() => r.campaignId && onSelect?.(r.campaignId)}
                className={`block w-full space-y-1.5 p-3 text-left ${selectedId && selectedId === r.campaignId ? 'bg-muted' : ''}`}>
                <div className="font-medium [overflow-wrap:anywhere]">{r.campaignName}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-slate-500">Leads</div><div className="tabular-nums font-medium">{fmtNum(r.leads)}</div></div>
                  <div><div className="text-slate-500">Qualified</div><div className="tabular-nums font-medium">{fmtNum(r.qualified)} <span className="text-[11px] font-normal text-slate-400">{pct(r.qualified, r.leads)}</span></div></div>
                  <div><div className="text-slate-500">Site visits</div><div className="tabular-nums font-medium">{fmtNum(r.siteVisits)}</div></div>
                  <div><div className="text-slate-500">Converted</div><div className="tabular-nums font-medium">{fmtNum(r.converted)} <span className="text-[11px] font-normal text-slate-400">{pct(r.converted, r.leads)}</span></div></div>
                  <div><div className="text-slate-500">Spend</div><div className="tabular-nums font-medium">{fmtMoney(r.spend, r.currency)}</div></div>
                  <div><div className="text-slate-500">CPL</div><div className="tabular-nums font-semibold">{fmtMoney(r.cpl, r.currency)}</div></div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead><TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Qualified</TableHead>
              <TableHead className="text-right">Site visits</TableHead><TableHead className="text-right">Converted</TableHead>
              <TableHead className="text-right">Spend</TableHead><TableHead className="text-right">CPL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.campaignId || 'none'} className={r.campaignId ? 'cursor-pointer' : ''} data-state={selectedId && selectedId === r.campaignId ? 'selected' : undefined}
                onClick={() => r.campaignId && onSelect?.(r.campaignId)}>
                <TableCell className="max-w-[260px] truncate font-medium" title={r.campaignName}>{r.campaignName}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(r.leads)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(r.qualified)} <span className="text-[11px] text-slate-400">{pct(r.qualified, r.leads)}</span></TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(r.siteVisits)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(r.converted)} <span className="text-[11px] text-slate-400">{pct(r.converted, r.leads)}</span></TableCell>
                <TableCell className="text-right tabular-nums">{fmtMoney(r.spend, r.currency)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtMoney(r.cpl, r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        </>
      )}
      {!spendAvailable && rows?.length > 0 && <p className="border-t px-3 py-2 text-[11px] text-slate-500">Spend and CPL appear after a sync with an ad account selected (needs the ads_read permission).</p>}
    </Card>
  );
}
