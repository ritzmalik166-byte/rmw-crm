'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/controls';
import { AvatarUploader } from '@/components/ui/avatar';
import { WebsiteBadge } from '@/components/ui/badge';

const empty = { avatar: null, fullName: '', mobile: '', email: '', password: '', confirmPassword: '', departmentId: '', teamId: '', websiteIds: [], notes: '' };

export default function RegisterPage() {
  const { data: cfg } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config') });
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleSite = (id) => setForm((f) => ({ ...f, websiteIds: f.websiteIds.includes(id) ? f.websiteIds.filter((x) => x !== id) : [...f.websiteIds, id] }));

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setErrors({});
    if (!form.avatar) { setErrors({ avatar: 'Upload a profile picture' }); return; }
    if (form.password !== form.confirmPassword) { setErrors({ confirmPassword: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      await api('/auth/register-request', {
        method: 'POST',
        body: { ...form, departmentId: form.departmentId ? Number(form.departmentId) : null, teamId: form.teamId ? Number(form.teamId) : null, notes: form.notes || null },
      });
      setDone(true);
    } catch (err) {
      setError(apiMessage(err));
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthCard title="Request submitted">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-600" />
          <p className="text-sm text-muted-foreground">A Super Admin will review your request. You&apos;ll get an email once your account is approved, then you can sign in.</p>
          <Button asChild variant="outline" className="mt-5"><Link href="/login">Back to sign in</Link></Button>
        </div>
      </AuthCard>
    );
  }

  const teams = (cfg?.teams || []).filter((t) => !form.departmentId || String(t.department_id) === form.departmentId);

  return (
    <AuthCard wide title="Request CRM access" description="Your account becomes active after Super Admin approval." footer={<>Already have an account? <Link href="/login" className="font-medium text-foreground hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-3">
        <FormError message={error} />
        <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {/* Left: photo, websites, notes */}
          <div className="space-y-3 lg:border-r lg:pr-6">
            <Field label="Profile picture" error={errors.avatar} hint="Required. Helps approvers recognise you.">
              <AvatarUploader size="h-16 w-16 text-lg" src={form.avatar} name={form.fullName} onChange={(avatar) => { setForm((f) => ({ ...f, avatar })); setErrors((e) => ({ ...e, avatar: undefined })); }} />
            </Field>
            <Field label="Website access requested">
              <div className="flex flex-col gap-2 pt-1">
                {cfg?.websites?.map((w) => (
                  <label key={w.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.websiteIds.includes(w.id)} onCheckedChange={() => toggleSite(w.id)} /><WebsiteBadge code={w.code} /><span className="text-muted-foreground">{w.name}</span></label>
                ))}
              </div>
            </Field>
            <Field label="Note for the approver (optional)" htmlFor="notes"><Textarea id="notes" rows={2} value={form.notes} onChange={set('notes')} maxLength={1000} placeholder="Role, manager, reason for access…" /></Field>
          </div>
          {/* Right: account details */}
          <div className="grid content-start gap-x-4 gap-y-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor="fullName" error={errors.fullName} className="sm:col-span-2"><Input id="fullName" value={form.fullName} onChange={set('fullName')} required autoComplete="name" /></Field>
            <Field label="Mobile" htmlFor="mobile" error={errors.mobile}><Input id="mobile" type="tel" value={form.mobile} onChange={set('mobile')} required autoComplete="tel" /></Field>
            <Field label="Email" htmlFor="email" error={errors.email}><Input id="email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
            <Field label="Password" htmlFor="password" error={errors.password} hint="10+ chars, upper, lower case and a number"><Input id="password" type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" /></Field>
            <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword}><Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} required autoComplete="new-password" /></Field>
            <Field label="Department" htmlFor="dept">
              <Select id="dept" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value, teamId: '' }))}>
                <option value="">Select…</option>
                {cfg?.departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Team" htmlFor="team">
              <Select id="team" value={form.teamId} onChange={set('teamId')}>
                <option value="">Select…</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Button type="submit" className="mt-1 w-full sm:col-span-2" loading={busy}>Submit request</Button>
          </div>
        </div>
      </form>
    </AuthCard>
  );
}
