import { cva } from 'class-variance-authority';
import { cn, STATUS_COLORS } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', {
  variants: {
    variant: {
      default: 'bg-slate-900 text-white ring-slate-900',
      secondary: 'bg-slate-100 text-slate-700 ring-slate-200',
      outline: 'bg-transparent text-foreground ring-border',
      success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
      warning: 'bg-amber-50 text-amber-800 ring-amber-200',
      danger: 'bg-red-50 text-red-700 ring-red-200',
      info: 'bg-blue-50 text-blue-700 ring-blue-200',
    },
  },
  defaultVariants: { variant: 'secondary' },
});

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

function StatusBadge({ name, color }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', STATUS_COLORS[color] || STATUS_COLORS.slate)}>{name}</span>;
}

const WEBSITE_STYLES = { MPF: 'bg-teal-50 text-teal-700 ring-teal-200', RMW: 'bg-rose-50 text-rose-700 ring-rose-200', CT: 'bg-purple-50 text-purple-700 ring-purple-200' };
function WebsiteBadge({ code }) {
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset', WEBSITE_STYLES[code] || STATUS_COLORS.slate)}>{code}</span>;
}

const ACCOUNT_VARIANT = { ACTIVE: 'success', PENDING_APPROVAL: 'warning', APPROVED: 'success', REJECTED: 'danger', DISABLED: 'secondary', SUSPENDED: 'danger' };
function AccountStatusBadge({ status }) {
  const label = String(status || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge variant={ACCOUNT_VARIANT[status] || 'secondary'}>{label}</Badge>;
}

export { Badge, badgeVariants, StatusBadge, WebsiteBadge, AccountStatusBadge };
