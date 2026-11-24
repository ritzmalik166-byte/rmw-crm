'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Check } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AuthCard, FormError, Notice, PasswordInput, PasswordChecklist, MobileInput, passwordOk, mobileOk, emailOk } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/controls';
import { AvatarUploader } from '@/components/ui/avatar';
import { WEBSITE_LOGOS } from '@/components/ui/badge';

const empty = { avatar: null, fullName: '', mobile: '', email: '', password: '', confirmPassword: '', departmentId: '', teamId: '', websiteIds: [], notes: '' };
const NOTE_MAX = 1000;

function Section({ step, title, description, children }) {
  return (
    <section className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[12px] font-semibold text-white">{step}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="sm:pl-9">{children}</div>
    </section>
  );
}

export default function RegisterPage() {
  const { data: cfg, isLoading: cfgLoading } = useQuery({ queryKey: ['public-config'], queryFn: () => api('/auth/public-config') });
  const [form, setForm] = useState(empty);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const setVal = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const set = (k) => (e) => setVal(k, e.target.value);
  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const toggleSite = (id) => setVal('websiteIds', form.websiteIds.includes(id) ? form.websiteIds.filter((x) => x !== id) : [...form.websiteIds, id]);

  // Client-side checks (the API validates again). Shown once a field has been left, or after a submit attempt.
  const check = {
    avatar: !form.avatar && 'Add a profile photo',
    fullName: form.fullName.trim().length < 2 && 'Enter your full name',
    mobile: !mobileOk(form.mobile) && 'Enter a valid 10-digit Indian mobile number',
    email: !emailOk(form.email) && 'Enter a valid email address',
    password: !passwordOk(form.password) && 'Password doesn’t meet the requirements below',
    confirmPassword: (!form.confirmPassword || form.confirmPassword !== form.password) && 'Passwords don’t match',
    websiteIds: !form.websiteIds.length && 'Choose at least one business',
  };
  const show = (k) => errors[k] || (touched[k] && check[k]) || undefined;
  const firstInvalid = Object.keys(check).find((k) => check[k]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (firstInvalid) {
      setTouched(Object.fromEntries(Object.keys(check).map((k) => [k, true])));
      document.getElementById(`f-${firstInvalid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!agree) { setError('Please confirm the data-use statement before submitting.'); return; }
    setBusy(true);
    try {
      await api('/auth/register-request', {
        method: 'POST',
        body: { ...form, fullName: form.fullName.trim(), email: form.email.trim(), departmentId: form.departmentId ? Number(form.departmentId) : null, teamId: form.teamId ? Number(form.teamId) : null, notes: form.notes.trim() || null },
      });
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(apiMessage(err));
      if (err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthCard title="Request sent" description="Thanks, we've received your access request.">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div className="text-[14px] text-slate-700">
            <p>What happens next:</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-slate-600">
              <li>A Super Admin reviews your details and the businesses you asked for.</li>
              <li>You get an email at <span className="font-medium text-slate-900">{form.email}</span> once it&apos;s approved.</li>
              <li>Sign in with the email and password you just set.</li>
            </ol>
            <p className="mt-3 text-[13px] text-slate-500">Taking longer than a working day? Let your manager know.</p>
          </div>
        </div>
        <Button asChild variant="outline" className="mt-6 w-full"><Link href="/login">Back to sign in</Link></Button>
      </AuthCard>
    );
  }

  const teams = (cfg?.teams || []).filter((t) => !form.departmentId || String(t.department_id) === form.departmentId);
  const pwMatch = form.confirmPassword && form.confirmPassword === form.password;

  return (
    <AuthCard
      wide
      title="Request an account"
      description="Fill in your details. Your account becomes active once a Super Admin approves it, usually within one working day."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        <FormError message={error} />

        <Section step="1" title="About you" description="So approvers know who's asking.">
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-6">
            <div id="f-avatar">
              <Field label="Profile photo" error={show('avatar')}>
                <AvatarUploader size="h-20 w-20 text-xl" src={form.avatar} name={form.fullName} onChange={(avatar) => setVal('avatar', avatar)} />
              </Field>
            </div>
            <div className="grid gap-4">
              <Field label="Full name" htmlFor="f-fullName" error={show('fullName')}>
                <Input id="f-fullName" value={form.fullName} onChange={set('fullName')} onBlur={touch('fullName')} autoComplete="name" placeholder="As on your company ID" maxLength={150} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" htmlFor="dept">
                  <Select id="dept" value={form.departmentId} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value, teamId: '' }))} disabled={cfgLoading}>
                    <option value="">{cfgLoading ? 'Loading…' : 'Select department'}</option>
                    {cfg?.departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Team" htmlFor="team" hint={form.departmentId && !teams.length ? 'No teams in this department yet.' : undefined}>
                  <Select id="team" value={form.teamId} onChange={set('teamId')} disabled={cfgLoading || (form.departmentId && !teams.length)}>
                    <option value="">Select team</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
              </div>
            </div>
          </div>
        </Section>

        <Section step="2" title="Sign-in details" description="You'll use these to sign in after approval.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Work email" htmlFor="f-email" error={show('email')}>
              <Input id="f-email" type="email" value={form.email} onChange={set('email')} onBlur={touch('email')} autoComplete="email" placeholder="name@company.com" required />
            </Field>
            <Field label="Mobile number" htmlFor="f-mobile" error={show('mobile')} hint="Used for sign-in codes.">
              <MobileInput id="f-mobile" value={form.mobile} onChange={(v) => setVal('mobile', v)} onBlur={touch('mobile')} required />
            </Field>
            <div className="space-y-1.5">
              <Field label="Password" htmlFor="f-password" error={show('password')}>
                <PasswordInput id="f-password" value={form.password} onChange={set('password')} onBlur={touch('password')} autoComplete="new-password" maxLength={128} required />
              </Field>
              <PasswordChecklist password={form.password} />
            </div>
            <Field label="Confirm password" htmlFor="f-confirmPassword" error={show('confirmPassword')} hint={pwMatch ? 'Passwords match.' : undefined}>
              <PasswordInput id="f-confirmPassword" value={form.confirmPassword} onChange={set('confirmPassword')} onBlur={touch('confirmPassword')} autoComplete="new-password" maxLength={128} required />
            </Field>
          </div>
        </Section>

        <Section step="3" title="Access" description="Which businesses' leads do you work on? Pick all that apply.">
          <div id="f-websiteIds" className="grid gap-2 sm:grid-cols-2">
            {cfgLoading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[58px] animate-pulse rounded-lg bg-slate-100" />)}
            {cfg?.websites?.map((w) => {
              const on = form.websiteIds.includes(w.id);
              return (
                <button key={w.id} type="button" role="checkbox" aria-checked={on} onClick={() => { toggleSite(w.id); setTouched((t) => ({ ...t, websiteIds: true })); }}
                  className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors', on ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white">
                    {WEBSITE_LOGOS[w.code] ? <img src={WEBSITE_LOGOS[w.code]} alt="" className="h-6 w-6 object-contain" /> : <span className="text-[11px] font-semibold">{w.code}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-slate-900">{w.name}</span>
                    <span className="block text-[12px] text-slate-500">{w.code}</span>
                  </span>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-white' : 'border-slate-300')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                </button>
              );
            })}
          </div>
          {show('websiteIds') && <p className="mt-1.5 text-xs text-destructive">{show('websiteIds')}</p>}

          <Field className="mt-4" label="Note for the approver (optional)" htmlFor="notes" hint={`${form.notes.length}/${NOTE_MAX}`}>
            <Textarea id="notes" rows={3} value={form.notes} onChange={set('notes')} maxLength={NOTE_MAX} placeholder="e.g. Joined the sales team this week, reporting to my team lead. Need MPF leads for Noida projects." />
          </Field>
        </Section>

        <div className="space-y-4 border-t border-slate-200 pt-5">
          <label className="flex items-start gap-2.5 text-[13.5px] leading-snug text-slate-700">
            <Checkbox className="mt-0.5" checked={agree} onCheckedChange={(v) => { setAgree(!!v); setError(''); }} />
            <span>I&apos;ll use customer contact details in this CRM only for company work and won&apos;t copy or share them outside it.</span>
          </label>
          {Object.values(touched).some(Boolean) && firstInvalid && <Notice tone="warning">Some details need attention. Check the highlighted fields above.</Notice>}
          <Button type="submit" className="w-full" loading={busy}>{busy ? 'Sending request…' : 'Send request'}</Button>
        </div>
      </form>
    </AuthCard>
  );
}
