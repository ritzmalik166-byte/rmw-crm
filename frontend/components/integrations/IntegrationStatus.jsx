import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATES = {
  CONNECTED: { label: 'Connected', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  SETUP_REQUIRED: { label: 'Setup required', dot: 'bg-amber-500', text: 'text-amber-800' },
  ERROR: { label: 'Connection error', dot: 'bg-red-500', text: 'text-red-700' },
  NOT_CONNECTED: { label: 'Not connected', dot: 'bg-slate-300', text: 'text-slate-600' },
  NOT_CONFIGURED: { label: 'Not configured', dot: 'bg-slate-300', text: 'text-slate-500' },
  COMING_SOON: { label: 'Coming soon', dot: 'bg-slate-200', text: 'text-slate-500' },
};

/** "● Connected" style status pill for an integration. */
export function IntegrationStatus({ state, className }) {
  const s = STATES[state] || STATES.NOT_CONNECTED;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium', s.text, className)}>
      <span className={cn('h-2 w-2 rounded-full', s.dot, state === 'CONNECTED' && 'ring-4 ring-emerald-100')} />{s.label}
    </span>
  );
}

/** One health check row: "Webhook  ✓ Active". ok: true | false | null (unknown). */
export function HealthCheck({ label, ok, okText = 'OK', badText = 'Problem', unknownText = 'Not checked', hint }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : MinusCircle;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className={cn('flex min-w-0 items-center gap-1.5 font-medium', ok === true ? 'text-emerald-700' : ok === false ? 'text-red-700' : 'text-slate-500')} title={hint || undefined}>
        <Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ok === true ? okText : ok === false ? badText : unknownText}</span>
      </span>
    </div>
  );
}

const REASONS = {
  ACCESS_DENIED: 'Meta connection was cancelled.',
  INVALID_STATE: 'The connection link expired or was already used. Start again.',
  SESSION_MISMATCH: 'Finish connecting in the same signed-in browser session you started from.',
  MISSING_PERMISSIONS: 'Some required permissions were declined. Connect again and allow every requested permission.',
  TOKEN_INVALID: 'Meta returned a token for a different app or an invalid token.',
  INVALID_CODE: 'Meta returned an invalid authorization code. Try again.',
  META_PERMISSION_DENIED: 'Meta denied access. Check the account has a role on the Page and the app has the required permissions.',
  META_RATE_LIMITED: 'Meta rate limit reached. Try again in a few minutes.',
};

export const oauthReasonMessage = (reason) => REASONS[reason] || 'Could not connect to Meta. Try again or check the integration log.';
