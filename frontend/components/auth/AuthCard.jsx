'use client';
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Eye, EyeOff, WifiOff, Check, LifeBuoy, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/* The four group businesses whose leads live in this CRM. */
const BRANDS = [
  { mark: '/mpf-mark.png', name: 'My Property Fact', note: 'Real estate enquiries' },
  { mark: '/rmw-mark.png', name: 'Ritz Media World', note: 'Media & advertising' },
  { mark: '/ct-mark.png', name: 'Contenaissance', note: 'Content services' },
  { mark: '/ctmpl-mark.png', name: 'Creative Thinks Media', note: 'Creative & digital' },
];

/** Current date and time in IST, updated every 30s. Rendered client-side only to avoid hydration mismatches. */
function IstClock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="invisible">—</span>;
  const fmt = (o) => now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...o });
  return <span>{fmt({ weekday: 'long', day: 'numeric', month: 'long' })} · {fmt({ hour: 'numeric', minute: '2-digit' })} IST</span>;
}

/** Left panel (desktop only): plain brand identity, the businesses served and where to get help. No sample data. */
function BrandPanel() {
  return (
    <aside className="relative hidden shrink-0 flex-col justify-between bg-[#0e1b33] text-white lg:flex lg:w-[400px] xl:w-[460px]">
      <div className="h-1 w-full bg-[#f28c28]" aria-hidden />
      <div className="flex flex-1 flex-col px-10 py-9 xl:px-12">
        <div className="flex items-center gap-3">
          <img src="/rmw-logo.png" alt="" className="h-11 w-11 rounded-lg bg-white object-contain p-1" />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold">RMW CRM</p>
            <p className="text-[12px] text-slate-400">Ritz Media World</p>
          </div>
        </div>

        <div className="mt-14 [@media(max-height:720px)]:mt-8">
          <h2 className="text-[26px] font-semibold leading-snug">Lead management for the RMW group.</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-300">
            Website, Meta and campaign enquiries from all four businesses, assigned to your team and tracked through to closure.
          </p>
        </div>

        <div className="mt-10 [@media(max-height:720px)]:mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Businesses on this CRM</p>
          <ul className="mt-3 divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {BRANDS.map((b) => (
              <li key={b.name} className="flex items-center gap-4 py-3 [@media(max-height:680px)]:py-1.5">
                <img src={b.mark} alt="" className="h-10 w-10 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-slate-100">{b.name}</span>
                  <span className="block text-[12px] text-slate-400">{b.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto pt-8 text-[12.5px] text-slate-400">
          <p className="flex items-start gap-2"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />Can&apos;t sign in or need access to another business? Ask your Super Admin or manager.</p>
          <p className="mt-4 border-t border-white/[0.08] pt-4 tabular-nums text-slate-500"><IstClock /></p>
        </div>
      </div>
    </aside>
  );
}

/** Shows a banner while the browser is offline, so a failed sign-in isn't blamed on the password. */
function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  if (!offline) return null;
  return <Notice tone="warning" icon={WifiOff} className="mb-4">You&apos;re offline. Check your internet connection and try again.</Notice>;
}

/**
 * Auth layout (sign in, OTP, request access, forgot / reset password).
 * Desktop: brand panel left, form right. Phones: a compact header above the form.
 */
export function AuthCard({ title, description, children, footer, wide = false }) {
  return (
    <div className="flex min-h-[100dvh] bg-white lg:h-[100dvh] lg:overflow-hidden">
      <BrandPanel />
      <main className="flex min-w-0 flex-1 flex-col bg-[#f7f8fa] lg:h-full lg:overflow-y-auto">
        <header className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-5 pb-3 pt-[calc(env(safe-area-inset-top)+14px)] lg:hidden">
          <img src="/rmw-logo.png" alt="" className="h-8 w-8 rounded-md object-contain" />
          <span className="text-[14px] font-semibold text-slate-900">RMW CRM</span>
          <span className="text-[12px] text-slate-500">· Ritz Media World</span>
        </header>

        <div className={cn('flex flex-1 justify-center px-4 sm:px-8', wide ? 'items-start py-8 lg:py-10' : 'items-center py-10')}>
          <div className={cn('w-full', wide ? 'max-w-[720px]' : 'max-w-[420px]')}>
            {wide && (
              <div className="mb-6">
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">{title}</h1>
                {description && <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{description}</p>}
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_8px_24px_-12px_rgb(15_23_42/0.12)] sm:p-8 [&_button[type=submit]]:h-11 [&_button[type=submit]]:w-full [&_button[type=submit]]:text-[15px] [&_button[type=submit]]:font-semibold [&_input:not([type=checkbox]):not([type=radio])]:h-11 [&_input]:text-[16px] [&_select]:h-11 [&_button[role=combobox]]:h-11 [&_button[role=combobox]]:rounded-lg [&_button[role=combobox]]:px-3 [&_button[role=combobox]]:text-[14.5px] sm:[&_input]:text-[14.5px]">
              {!wide && (
                <div className="mb-6">
                  <h1 className="text-[22px] font-bold tracking-tight text-slate-900">{title}</h1>
                  {description && <p className="mt-1 text-[14px] leading-relaxed text-slate-500">{description}</p>}
                </div>
              )}
              <OfflineNotice />
              {children}
            </div>
            {footer && <div className="mt-5 text-center text-[13.5px] text-slate-600">{footer}</div>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200 bg-white px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] text-[12px] text-slate-500 sm:px-8">
          <span>© {new Date().getFullYear()} Ritz Media World. For authorised staff only.</span>
          <span>Sign-ins are recorded for security.</span>
        </footer>
      </main>
    </div>
  );
}

const TONES = {
  error: { cls: 'border-red-200 bg-red-50 text-red-800', icon: AlertCircle },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertCircle },
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
};

export function Notice({ tone = 'info', icon, children, className }) {
  const t = TONES[tone];
  const Icon = icon || t.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-snug', t.cls, className)}>
      <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden /><div className="min-w-0">{children}</div>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <Notice tone="error">{message}</Notice>;
}

/** Password input with show/hide and a Caps Lock warning. */
export function PasswordInput({ id, value, onChange, autoComplete = 'current-password', className, withIcon = false, ...rest }) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const checkCaps = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  return (
    <div>
      <div className="relative">
        {withIcon && <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />}
        <input
          id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete}
          onKeyDown={checkCaps} onKeyUp={checkCaps} onBlur={() => setCaps(false)}
          className={cn('flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pr-11 text-sm transition-colors hover:border-slate-400 placeholder:text-slate-400 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15', withIcon && 'pl-10', className)}
          {...rest}
        />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {caps && <p className="mt-1.5 text-[12px] font-medium text-amber-700">Caps Lock is on.</p>}
    </div>
  );
}

/** Same rules as the API (validatePasswordStrength). */
export const PASSWORD_RULES = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['An upper-case letter', (p) => /[A-Z]/.test(p)],
  ['A lower-case letter', (p) => /[a-z]/.test(p)],
  ['A number', (p) => /\d/.test(p)],
];
export const passwordOk = (p) => p.length <= 128 && PASSWORD_RULES.every(([, test]) => test(p));

export function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]" aria-label="Password requirements">
      {PASSWORD_RULES.map(([label, test]) => {
        const met = test(password);
        return (
          <li key={label} className={cn('flex items-center gap-1.5', met ? 'text-emerald-700' : 'text-slate-500')}>
            {met ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="mx-[3px] h-2 w-2 rounded-full border border-slate-400" aria-hidden />}
            {label}<span className="sr-only">{met ? ' (done)' : ' (missing)'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Indian mobile input with a fixed +91 prefix; keeps digits only. */
export function MobileInput({ id, value, onChange, ...rest }) {
  return (
    <div className="flex">
      <span className="inline-flex items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-[14px] font-medium text-slate-600">+91</span>
      <input
        id={id} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit mobile number"
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        className="flex h-10 w-full min-w-0 rounded-r-lg border border-slate-300 bg-white px-3 text-sm tabular-nums tracking-wide transition-colors placeholder:tracking-normal placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15"
        {...rest}
      />
    </div>
  );
}
/** Text/email input with a leading icon, styled to match PasswordInput. */
export function IconInput({ icon: Icon, className, ...rest }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        className={cn('flex h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm transition-colors placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15', className)}
        {...rest}
      />
    </div>
  );
}

export const mobileOk = (m) => /^[6-9]\d{9}$/.test(m);
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
