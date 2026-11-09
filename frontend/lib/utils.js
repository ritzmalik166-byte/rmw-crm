import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const dtf = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (v) => (v ? dtf.format(new Date(v)) : '—');
export const formatDate = (v) => (v ? df.format(new Date(v)) : '—');

export function timeAgo(v) {
  if (!v) return '—';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 45) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, sec] of units) {
    const n = Math.floor(Math.abs(s) / sec);
    if (n >= 1) return s > 0 ? `${n} ${u}${n > 1 ? 's' : ''} ago` : `in ${n} ${u}${n > 1 ? 's' : ''}`;
  }
  return 'just now';
}

export const titleCase = (s) => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const STATUS_COLORS = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};

export function toQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}
