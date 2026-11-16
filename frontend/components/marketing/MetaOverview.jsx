import { Users2, Sparkles, BadgeCheck, MapPinned, Trophy, IndianRupee } from 'lucide-react';
import { StatCard } from '@/components/ui/feedback';

export const fmtNum = (v) => Number(v || 0).toLocaleString('en-IN');
export const fmtMoney = (v, currency) => (v == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(v));

/** KPI tiles for Meta leads in the selected range. */
export function MetaOverview({ totals }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total leads" value={fmtNum(totals.total)} icon={Users2} hint={totals.excludedJunk ? `${fmtNum(totals.excludedJunk)} junk/test excluded` : undefined} />
      <StatCard label="New" value={fmtNum(totals.newLeads)} icon={Sparkles} hint="Not yet worked" />
      <StatCard label="Qualified" value={fmtNum(totals.qualified)} icon={BadgeCheck} />
      <StatCard label="Site visits" value={fmtNum(totals.siteVisits)} icon={MapPinned} />
      <StatCard label="Converted" value={fmtNum(totals.converted)} icon={Trophy} tone="success" hint={`${totals.conversionRate}% of leads`} />
      <StatCard label="Cost per lead" value={fmtMoney(totals.cpl, totals.currency)} icon={IndianRupee} hint={totals.spend != null ? `${fmtMoney(totals.spend, totals.currency)} spend` : 'Select an ad account to track spend'} />
    </div>
  );
}
