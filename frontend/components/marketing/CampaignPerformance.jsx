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
      )}
      {!spendAvailable && rows?.length > 0 && <p className="border-t px-3 py-2 text-[11px] text-slate-500">Spend and CPL appear after a sync with an ad account selected (needs the ads_read permission).</p>}
    </Card>
  );
}
