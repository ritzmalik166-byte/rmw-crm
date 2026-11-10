'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, Globe, Mail, Phone, Users2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { enablePush, disablePush, currentSubscription, pushSupported } from '@/lib/push';
import { titleCase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/controls';
import { WebsiteBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/feedback';
import { AvatarUploader } from '@/components/ui/avatar';

const TYPE_LABELS = {
  NEW_LEAD: 'New lead on my websites', LEAD_ASSIGNED: 'Lead assigned to me', LEAD_REASSIGNED: 'Lead reassigned to me',
  FOLLOWUP_DUE: 'Follow-up due soon', FOLLOWUP_OVERDUE: 'Follow-up overdue', SYSTEM: 'System alerts', ACCOUNT_REQUEST: 'New account requests',
};

function ProfileSummary() {
  const { me, refetch } = useAuth();
  const saveAvatar = async (avatar) => {
    try {
      await api('/auth/me/avatar', { method: 'PUT', body: { avatar } });
      toast.success(avatar ? 'Profile picture updated' : 'Profile picture removed');
      await refetch();
    } catch (e) { toast.error(apiMessage(e)); throw e; }
  };
  const u = me?.user;
  return (
    <Card className="overflow-hidden lg:sticky lg:top-20">
      <div className="h-20 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(213_60%_45%)]" />
      <CardContent className="-mt-12 space-y-5">
        <AvatarUploader src={u?.avatar} name={u?.full_name} onChange={saveAvatar} />
        <div>
          <p className="text-lg font-semibold leading-tight">{u?.full_name}</p>
          <p className="text-sm capitalize text-muted-foreground">{me?.roles?.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ')}</p>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center gap-2.5"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{u?.email}</span></div>
          <div className="flex items-center gap-2.5"><Phone className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="tabular-nums">{u?.mobile}</span></div>
          {me?.teams?.length > 0 && <div className="flex items-center gap-2.5"><Users2 className="h-4 w-4 shrink-0 text-muted-foreground" /><span>{me.teams.map((t) => t.name).join(', ')}</span></div>}
          <div className="flex items-center gap-2.5"><Globe className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="flex flex-wrap gap-1.5">{me?.websites?.map((w) => <WebsiteBadge key={w.id} code={w.code} />)}</div></div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Profile() {
  const { me, refetch } = useAuth();
  const [name, setName] = useState(me?.user?.full_name || '');
  const m = useMutation({ mutationFn: () => api('/auth/me', { method: 'PATCH', body: { fullName: name } }), onSuccess: () => { toast.success('Profile updated'); refetch(); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Your email address can only be changed by an administrator.</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input value={me?.user?.email || ''} disabled /></Field>
          <div className="sm:col-span-2"><Button type="submit" loading={m.isPending} disabled={!name.trim() || name === me?.user?.full_name}>Save</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Two steps: new number + current password, then the OTP sent to the new number. */
function MobileNumber() {
  const { me, refetch } = useAuth();
  const [step, setStep] = useState('view'); // view | form | otp
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  const reset = () => { setStep('view'); setMobile(''); setPassword(''); setOtp(''); setSent(null); };

  const request = useMutation({
    mutationFn: () => api('/auth/me/mobile/request', { method: 'POST', body: { mobile, currentPassword: password } }),
    onSuccess: (r) => { setSent(r); setCooldown(r?.resendIn || 60); setStep('otp'); toast.success(`Code sent to ${r.maskedMobile}`); },
    onError: (e) => { toast.error(apiMessage(e)); if (e.details?.retryAfter) setCooldown(e.details.retryAfter); },
  });
  const verify = useMutation({
    mutationFn: () => api('/auth/me/mobile/verify', { method: 'POST', body: { otp } }),
    onSuccess: async () => { toast.success('Mobile number updated'); await refetch(); reset(); },
    onError: (e) => { toast.error(apiMessage(e)); if (e.errorCode === 'CHALLENGE_EXPIRED') setStep('form'); },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mobile number</CardTitle>
        <CardDescription>Used for sign-in codes. A new number must be verified with a code sent to it.</CardDescription>
      </CardHeader>
      <CardContent>
        {step === 'view' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3">
            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-muted-foreground" /><span className="font-medium tabular-nums">{me?.user?.mobile}</span></div>
            <Button variant="outline" size="sm" onClick={() => setStep('form')}>Change number</Button>
          </div>
        )}
        {step === 'form' && (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
            <Field label="New mobile number"><Input type="tel" inputMode="tel" autoComplete="tel" placeholder="98XXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} required autoFocus /></Field>
            <Field label="Current password" hint="Confirms it's really you"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" loading={request.isPending} disabled={cooldown > 0}>{request.isPending ? 'Sending code…' : cooldown > 0 ? `Send code (${cooldown}s)` : 'Send code'}</Button>
              <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </form>
        )}
        {step === 'otp' && (
          <form className="max-w-sm space-y-4" onSubmit={(e) => { e.preventDefault(); verify.mutate(); }}>
            <p className="text-sm text-muted-foreground">Enter the code sent to <span className="font-medium text-foreground">{sent?.maskedMobile}</span>.</p>
            <Field label="Verification code"><Input inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.4em]" required /></Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" loading={verify.isPending} disabled={otp.length < 4}>{verify.isPending ? 'Verifying…' : 'Verify and update'}</Button>
              <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
              <button type="button" className="ml-auto text-sm font-medium disabled:text-muted-foreground" disabled={cooldown > 0 || request.isPending} onClick={() => request.mutate()}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const m = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } }),
    onSuccess: () => { toast.success('Password changed. Other sessions were signed out.'); setF({ currentPassword: '', newPassword: '', confirm: '' }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const mismatch = f.confirm && f.confirm !== f.newPassword;
  return (
    <Card>
      <CardHeader><CardTitle>Password</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); if (!mismatch) m.mutate(); }}>
          <Field label="Current password"><Input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required /></Field>
          <Field label="New password" hint="10+ chars, upper, lower, number"><Input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required /></Field>
          <Field label="Confirm" error={mismatch ? 'Passwords do not match' : null}><Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></Field>
          <div className="sm:col-span-3"><Button type="submit" loading={m.isPending}>Change password</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function PushToggle() {
  const [state, setState] = useState('loading');
  useEffect(() => {
    if (!pushSupported()) { setState('unsupported'); return; }
    currentSubscription().then((s) => setState(s ? 'on' : 'off')).catch(() => setState('off'));
  }, []);
  const toggle = async () => {
    try {
      if (state === 'on') { await disablePush(); setState('off'); toast.success('Push notifications turned off for this browser'); }
      else { setState('loading'); await enablePush(); setState('on'); toast.success('Push notifications enabled for this browser'); }
    } catch (e) { toast.error(e.message); setState('off'); }
  };
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Browser push notifications</p>
          <p className="text-xs text-muted-foreground">{state === 'unsupported' ? 'This browser does not support web push.' : 'Get alerts even when the CRM tab is closed. Enable on each browser/device you use.'}</p>
        </div>
      </div>
      {state !== 'unsupported' && <Button variant={state === 'on' ? 'outline' : 'default'} size="sm" onClick={toggle} loading={state === 'loading'}>{state === 'on' ? 'Turn off' : 'Enable'}</Button>}
    </div>
  );
}

function NotificationPrefs() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api('/crm/notifications/preferences') });
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { if (data) setPrefs(data); }, [data]);
  const m = useMutation({ mutationFn: () => api('/crm/notifications/preferences', { method: 'PUT', body: { preferences: prefs } }), onSuccess: () => { toast.success('Preferences saved'); qc.invalidateQueries({ queryKey: ['notification-prefs'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  const set = (type, key, val) => setPrefs((p) => p.map((x) => (x.type === type ? { ...x, [key]: val } : x)));
  return (
    <Card id="notifications">
      <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>Choose how you hear about each event.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <PushToggle />
        {prefs && (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-muted-foreground"><th className="py-2 text-left font-medium">Event</th><th className="w-20 font-medium">In-app</th><th className="w-20 font-medium">Push</th><th className="w-20 font-medium">Email</th></tr></thead>
            <tbody className="divide-y">
              {prefs.map((p) => (
                <tr key={p.type}>
                  <td className="py-2.5">{TYPE_LABELS[p.type] || titleCase(p.type)}</td>
                  {['inApp', 'push', 'email'].map((k) => <td key={k} className="text-center"><Switch checked={p[k]} onCheckedChange={(v) => set(p.type, k, v)} aria-label={`${k} for ${p.type}`} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Button onClick={() => m.mutate()} loading={m.isPending} disabled={!prefs}>Save preferences</Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, sign-in details and notifications." />
      <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ProfileSummary />
        <div className="min-w-0 space-y-5">
          <Profile />
          <MobileNumber />
          <ChangePassword />
          <NotificationPrefs />
        </div>
      </div>
    </>
  );
}
