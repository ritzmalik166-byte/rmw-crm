'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Mail, ShieldCheck } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
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
      onDone();
    } catch (err) {
      setError(apiMessage(err));
      if (err.errorCode === 'CHALLENGE_EXPIRED') setTimeout(onBack, 1500);
    } finally { setBusy(false); }
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
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>We don&apos;t recognise this device. For your security, enter the code sent to your registered mobile.</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">Code sent to <span className="font-medium text-foreground">{info.maskedMobile}</span></p>
      <FormError message={error} />
      <Field label="Verification code" htmlFor="otp">
        <Input id="otp" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={8} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.4em]" required />
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
      <Button type="submit" className="w-full" loading={busy} disabled={otp.length < 4}>Verify and sign in</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={onBack}>Back</button>
        <button type="button" className="font-medium disabled:text-muted-foreground" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </form>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobile, setMobile] = useState('');
  const [otpInfo, setOtpInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] });
    router.replace(safeNext(params.get('next')));
  };

  const loginPassword = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password } });
      if (r.requiresOtp) setOtpInfo(r); else await done();
    } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const r = await api('/auth/otp/send', { method: 'POST', body: { mobile } });
      setOtpInfo({ ...r, reason: 'LOGIN_OTP' });
    } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  if (otpInfo) {
    return (
      <AuthCard title="Verify it's you" description="Enter the code we sent by SMS.">
        <OtpStep info={otpInfo} onBack={() => setOtpInfo(null)} onDone={done} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to the RMW CRM."
      footer={<>Need an account? <Link href="/register" className="font-medium text-foreground hover:underline">Request access</Link></>}
    >
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <button className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium ${mode === 'password' ? 'bg-white shadow-sm' : 'text-slate-600'}`} onClick={() => { setMode('password'); setError(''); }}><Mail className="h-4 w-4" />Email</button>
        <button className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium ${mode === 'otp' ? 'bg-white shadow-sm' : 'text-slate-600'}`} onClick={() => { setMode('otp'); setError(''); }}><Smartphone className="h-4 w-4" />Mobile OTP</button>
      </div>
      <FormError message={error} />
      {mode === 'password' ? (
        <form onSubmit={loginPassword} className="mt-4 space-y-4">
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
          <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-foreground">Forgot password?</Link></div>
          <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
        </form>
      ) : (
        <form onSubmit={sendOtp} className="mt-4 space-y-4">
          <Field label="Mobile number" htmlFor="mobile" hint="We'll send a one-time code to your registered number.">
            <Input id="mobile" type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} required autoFocus />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>Send code</Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
