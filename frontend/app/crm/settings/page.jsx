'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
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

const TYPE_LABELS = {
  NEW_LEAD: 'New lead on my websites', LEAD_ASSIGNED: 'Lead assigned to me', LEAD_REASSIGNED: 'Lead reassigned to me',
  FOLLOWUP_DUE: 'Follow-up due soon', FOLLOWUP_OVERDUE: 'Follow-up overdue', SYSTEM: 'System alerts', ACCOUNT_REQUEST: 'New account requests',
};

function Profile() {
  const { me, refetch } = useAuth();
  const [name, setName] = useState(me?.user?.full_name || '');
  const m = useMutation({ mutationFn: () => api('/auth/me', { method: 'PATCH', body: { fullName: name } }), onSuccess: () => { toast.success('Profile updated'); refetch(); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Email and mobile changes are made by an administrator.</CardDescription></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><Input value={me?.user?.email || ''} disabled /></Field>
        <Field label="Mobile"><Input value={me?.user?.mobile || ''} disabled /></Field>
        <Field label="Website access"><div className="flex h-9 items-center gap-1.5">{me?.websites?.map((w) => <WebsiteBadge key={w.id} code={w.code} />)}</div></Field>
        <div className="sm:col-span-2"><Button onClick={() => m.mutate()} loading={m.isPending} disabled={!name.trim() || name === me?.user?.full_name}>Save</Button></div>
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
      <PageHeader title="Settings" />
      <div className="max-w-4xl space-y-5">
        <Profile />
        <ChangePassword />
        <NotificationPrefs />
      </div>
    </>
  );
}
