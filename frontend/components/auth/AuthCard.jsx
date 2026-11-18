import { MetaMark } from '@/components/integrations/MetaLogo';
import { ShieldCheck, Zap, Users2, CalendarClock, Lock, TrendingUp } from 'lucide-react';

/* Illustrative product preview for the brand panel (sample figures, not live data). */
const PREVIEW_LEADS = [
  { name: 'Aarav M.', source: 'Meta', logo: null, meta: true, status: 'New', tone: 'bg-sky-400/20 text-sky-100' },
  { name: 'Priya S.', source: 'MPF', logo: '/mpf-mark.png', status: 'Contacted', tone: 'bg-amber-400/20 text-amber-100' },
  { name: 'Rohan K.', source: 'CTMPL', logo: '/ctmpl-mark.png', status: 'Qualified', tone: 'bg-emerald-400/20 text-emerald-100' },
];

const FEATURES = [
  { icon: Zap, title: 'Real-time capture', text: 'Meta, websites and landing pages land in seconds.' },
  { icon: Users2, title: 'Smart assignment', text: 'Every lead routed to the right team automatically.' },
  { icon: CalendarClock, title: 'Never miss a follow-up', text: 'Reminders, overdue alerts and a full activity trail.' },
];

/** Left brand panel (desktop): positioning, an illustrative dashboard preview, features and the group brands. */
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[hsl(214_70%_14%)] text-white lg:flex lg:w-[42%] xl:w-[46%]">
      {/* Mesh + grid backdrop */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(700px_420px_at_10%_0%,hsl(213_80%_38%/.85),transparent_65%),radial-gradient(600px_400px_at_100%_100%,hsl(28_92%_52%/.35),transparent_60%),radial-gradient(500px_300px_at_90%_10%,hsl(190_80%_45%/.25),transparent_60%)]" />
      <div aria-hidden className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,#000_40%,transparent_80%)]" />

      <div className="relative z-10 flex h-full w-full flex-col px-10 py-7 xl:px-14 [@media(max-height:760px)]:py-5">
        <div className="flex items-center gap-3">
          <img src="/rmw-logo.png" alt="Ritz Media World" className="h-10 w-10 rounded-xl bg-white object-contain p-1 shadow-lg shadow-black/20" />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">RMW CRM</p>
            <p className="text-[11px] text-white/60">Ritz Media World · Lead Management</p>
          </div>
        </div>

        <div className="my-auto py-6 [@media(max-height:760px)]:py-3">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live lead pipeline
          </p>
          <h2 className="mt-4 max-w-md text-[34px] font-semibold leading-[1.1] tracking-tight xl:text-[40px] [@media(max-height:800px)]:mt-3 [@media(max-height:800px)]:text-[30px]">
            Every lead.<br /><span className="bg-gradient-to-r from-white via-sky-200 to-amber-200 bg-clip-text text-transparent">One workspace.</span>
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/70">
            Capture, assign and convert enquiries from every brand and channel, in one secure CRM built for the RMW group.
          </p>

          {/* Illustrative dashboard preview */}
          <div className="mt-6 max-w-md rounded-2xl border border-white/15 [@media(max-height:800px)]:mt-4 [@media(max-height:640px)]:hidden bg-white/[0.07] p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Today&apos;s pipeline</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"><TrendingUp className="h-3 w-3" />+18%</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[['New leads', '128'], ['Assigned', '96%'], ['Follow-ups', '42']].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
                  <p className="text-[10.5px] text-white/55">{l}</p>
                  <p className="text-[18px] font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <svg viewBox="0 0 300 54" preserveAspectRatio="none" className="mt-3 h-12 w-full [@media(max-height:860px)]:h-8" aria-hidden>
              <defs><linearGradient id="authSpark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7dd3fc" stopOpacity=".45" /><stop offset="1" stopColor="#7dd3fc" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 44 L25 40 L50 42 L75 33 L100 36 L125 26 L150 29 L175 20 L200 23 L225 14 L250 17 L275 8 L300 10 L300 54 L0 54 Z" fill="url(#authSpark)" />
              <path d="M0 44 L25 40 L50 42 L75 33 L100 36 L125 26 L150 29 L175 20 L200 23 L225 14 L250 17 L275 8 L300 10" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <ul className="mt-2 space-y-1.5 [@media(max-height:860px)]:hidden">
              {PREVIEW_LEADS.map((l) => (
                <li key={l.name} className="flex items-center gap-2.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90">
                    {l.meta ? <MetaMark className="h-4 w-4" /> : <img src={l.logo} alt="" className="h-4 w-4 object-contain" />}
                  </span>
                  <span className="flex-1 text-[12.5px] font-medium">{l.name}<span className="ml-1.5 text-[11px] font-normal text-white/50">via {l.source}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${l.tone}`}>{l.status}</span>
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-6 grid max-w-md gap-3 [@media(max-height:760px)]:hidden">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10"><f.icon className="h-4 w-4 text-sky-200" /></span>
                <span><span className="block text-[13.5px] font-semibold">{f.title}</span><span className="block text-[12.5px] text-white/60">{f.text}</span></span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/50">One CRM for</span>
            {['/mpf-mark.png', '/rmw-mark.png', '/ct-mark.png', '/ctmpl-mark.png'].map((src) => (
              <span key={src} className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-sm"><img src={src} alt="" className="h-5 w-5 object-contain" /></span>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50"><ShieldCheck className="h-3.5 w-3.5" />Encrypted · Access logged</span>
        </div>
      </div>
    </aside>
  );
}

/**
 * Auth layout (sign in, OTP, request access, forgot / reset password): split screen like modern SaaS CRMs.
 * Brand panel on the left (desktop), focused form on the right. Phones get a compact branded header instead.
 */
export function AuthCard({ title, description, children, footer, wide = false }) {
  return (
    <div className="flex min-h-[100dvh] bg-white lg:h-[100dvh] lg:overflow-hidden">
      <BrandPanel />
      <main className="relative flex min-w-0 flex-1 flex-col lg:h-full lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_100%_0%,hsl(213_85%_94%/.7),transparent_70%),radial-gradient(500px_300px_at_0%_100%,hsl(28_95%_93%/.45),transparent_70%)]" />

        {/* Phone / tablet brand header */}
        <header className="relative z-10 flex items-center gap-2.5 px-5 pb-2 pt-[calc(env(safe-area-inset-top)+18px)] lg:hidden">
          <img src="/rmw-logo.png" alt="Ritz Media World" className="h-9 w-9 rounded-xl bg-white object-contain p-0.5 shadow-md ring-1 ring-slate-200" />
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold text-slate-900">RMW CRM</span>
            <span className="block text-[11px] text-slate-500">Ritz Media World · Lead Management</span>
          </span>
        </header>

        <div className={`relative z-10 flex flex-1 justify-center px-5 sm:px-8 ${wide ? 'items-start py-6 lg:items-center lg:py-4' : 'items-center py-8 lg:py-4'}`}>
          <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-[400px]'}`}>
            <div className="mb-5 [@media(max-height:760px)]:mb-3">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
              {description && <p className="mt-1.5 text-[14px] text-slate-500">{description}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_12px_32px_-12px_rgb(25_65_115/0.18)] backdrop-blur sm:p-6 [&_button[type=submit]]:h-10 [&_button[type=submit]]:text-[14px] [&_input:not([type=checkbox]):not([type=radio])]:h-10 [&_input]:text-[14px] [&_select]:h-10">
              {children}
            </div>
            {footer && <div className="mt-4 text-center text-[13px] text-slate-500">{footer}</div>}
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-slate-400"><Lock className="h-3 w-3" />Authorised users only. All access is logged and monitored.</p>
          </div>
        </div>

        <footer className="relative z-10 flex items-center justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+14px)] text-[11.5px] text-slate-400">
          <span>© {new Date().getFullYear()} Ritz Media World</span>
          <span className="hidden sm:inline">Secure sign-in over HTTPS</span>
        </footer>
      </main>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{message}</div>;
}
