'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Mail, ShieldCheck } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError, Notice, PasswordInput, MobileInput, IconInput, mobileOk, emailOk } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/controls';

function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/crm/dashboard';
}

function OtpStep({ info, onBack, onDone }) {
  const { data: cfg } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config') });
  const [otp, setOtp] = useState('');
  const [trust, setTrust] = useState(false);
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(info.resendIn || 60);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api('/auth/otp/verify', { method: 'POST', body: { otp, trustDevice: trust, trustDays: Number(days || cfg?.trustedDeviceDefault) } });
      await onDone(); // stay busy while redirecting
    } catch (err) {
      setError(apiMessage(err));
      setBusy(false);
      if (err.errorCode === 'CHALLENGE_EXPIRED') setTimeout(onBack, 1500);
    }
  };

  const resend = async () => {
    setError('');
    try {
      const r = await api('/auth/otp/resend', { method: 'POST' });
      setCooldown(r?.resendIn || 60);
    } catch (err) {
      setError(apiMessage(err));
      if (err.details?.retryAfter) setCooldown(err.details.retryAfter);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {info.reason === 'NEW_DEVICE' && (
        <Notice tone="warning" icon={ShieldCheck}>This device is new to us. For your security, enter the code sent to your registered mobile.</Notice>
      )}
      <p className="text-sm text-muted-foreground">Code sent to <span className="font-medium text-foreground">{info.maskedMobile}</span></p>
      <FormError message={error} />
      <Field label="Verification code" htmlFor="otp">
        <Input id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="text-center font-mono text-xl tracking-[0.5em]" required />
      </Field>
      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={trust} onCheckedChange={(v) => setTrust(!!v)} />
          Trust this device
        </label>
        {trust && (
          <div className="flex items-center gap-2 pl-6 text-sm text-muted-foreground">
            for
            <Select className="h-8 w-28" value={days || cfg?.trustedDeviceDefault || ''} onChange={(e) => setDays(e.target.value)}>
              {(cfg?.trustedDeviceDays || [7, 30, 90]).map((d) => <option key={d} value={d}>{d} days</option>)}
            </Select>
          </div>
        )}
        <p className="pl-6 text-xs text-muted-foreground">Only on a computer or phone you use personally.</p>
      </div>
      <Button type="submit" className="w-full" loading={busy} disabled={otp.length < 4}>{busy ? 'Signing in…' : 'Verify and sign in'}</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-slate-600 hover:text-slate-900" onClick={onBack}>&larr; Use a different method</button>
        <button type="button" className="font-medium text-primary disabled:text-slate-400" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

const EMAIL_KEY = 'crm.lastEmail';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config'), staleTime: 300_000 });
  const otpEnabled = cfg?.otpEnabled !== false;
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(true);
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otpInfo, setOtpInfo] = useState(null);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState(0);
  const [busy, setBusy] = useState(false);

  // Pre-fill the email used last time on this device.
  useEffect(() => {
    try { const saved = localStorage.getItem(EMAIL_KEY); if (saved) setEmail(saved); else setRemember(false); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { if (!otpEnabled && mode === 'otp') setMode('password'); }, [otpEnabled, mode]);

  const done = async () => {
    try { sessionStorage.setItem('crm:justLoggedIn', '1'); } catch { /* storage blocked */ }
    await qc.invalidateQueries({ queryKey: ['me'] });
    router.replace(safeNext(params.get('next')));
  };

  const loginPassword = async (e) => {
    e.preventDefault();
    if (!emailOk(email)) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setError(''); setBusy(true);
    try {
      try { if (remember) localStorage.setItem(EMAIL_KEY, email.trim()); else localStorage.removeItem(EMAIL_KEY); } catch { /* storage blocked */ }
      const r = await api('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      if (r.requiresOtp) { setOtpInfo(r); setBusy(false); } else await done(); // stay busy while redirecting
    } catch (err) { setError(apiMessage(err)); setFailures((n) => n + 1); setPassword(''); setBusy(false); }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    if (!mobileOk(mobile)) { setError('Enter your 10-digit mobile number.'); return; }
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/otp/send', { method: 'POST', body: { mobile } });
      setOtpInfo({ ...r, reason: 'LOGIN_OTP' });
    } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  if (otpInfo) {
    return (
      <AuthCard title="Enter verification code" description="We sent a one-time code by SMS.">
        <OtpStep info={otpInfo} onBack={() => setOtpInfo(null)} onDone={done} />
      </AuthCard>
    );
  }

  const switchMode = (m) => { setMode(m); setError(''); };

  return (
    <AuthCard
      title={mode === 'otp' ? 'Sign in with mobile' : 'Sign in to RMW CRM'}
      description={mode === 'otp' ? "We'll text a one-time code to your registered number." : 'Welcome back. Enter your work email and password.'}
      footer={<>New to the team? <Link href="/register" className="font-semibold text-primary hover:underline">Request an account</Link></>}
    >
      {params.get('next') && <Notice tone="info" className="mb-4">Your session ended. Sign in to continue where you left off.</Notice>}
      <FormError message={error} />
      {failures >= 2 && mode === 'password' && (
        <Notice tone="warning" className="mt-3">Having trouble? <Link href="/forgot-password" className="font-medium underline">Reset your password</Link>. Repeated failed attempts may lock the account for a while.</Notice>
      )}
      {mode === 'password' ? (
        <form onSubmit={loginPassword} className={error || failures >= 2 ? 'mt-5 space-y-5' : 'space-y-5'} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px] font-semibold text-slate-700">Work email</Label>
            <IconInput icon={Mail} id="email" type="email" autoComplete="username" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!email} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px] font-semibold text-slate-700">Password</Label>
            <PasswordInput withIcon id="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={Boolean(email)} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-slate-600">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />Remember me
            </label>
            <Link href="/forgot-password" className="text-[13.5px] font-semibold text-primary hover:underline">Forgot password?</Link>
          </div>
          <Button type="submit" className="w-full" loading={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      ) : (
        <form onSubmit={sendOtp} className={error ? 'mt-5 space-y-5' : 'space-y-5'} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="mobile" className="text-[13px] font-semibold text-slate-700">Registered mobile number</Label>
            <MobileInput id="mobile" value={mobile} onChange={setMobile} required autoFocus />
          </div>
          <Button type="submit" className="w-full" loading={busy}>{busy ? 'Sending code…' : 'Send code'}</Button>
        </form>
      )}

      {otpEnabled && (
        <>
          <div className="my-6 flex items-center gap-3 text-[12px] font-medium uppercase tracking-wider text-slate-400" aria-hidden>
            <span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" onClick={() => switchMode(mode === 'otp' ? 'password' : 'otp')}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-[14.5px] font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50">
            {mode === 'otp' ? <><Mail className="h-4 w-4" />Use email and password</> : <><Smartphone className="h-4 w-4" />Sign in with mobile OTP</>}
          </button>
        </>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
