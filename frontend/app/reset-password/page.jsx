'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError, PasswordInput, PasswordChecklist, passwordOk } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';

function ResetInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordOk(password)) { setError('Choose a password that meets all the requirements.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setError(''); setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password, confirmPassword } });
      toast.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  if (!token) {
    return <AuthCard title="Invalid link" footer={<Link href="/forgot-password" className="hover:text-foreground">Request a new link</Link>}><p className="text-sm text-slate-600">This reset link is incomplete. Open the link from the email again, or request a new one.</p></AuthCard>;
  }

  return (
    <AuthCard title="Set a new password" description="All other sessions will be signed out.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div><Field label="New password" htmlFor="pw"><PasswordInput id="pw" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} required autoFocus /></Field><PasswordChecklist password={password} /></div>
        <Field label="Confirm password" htmlFor="pw2" error={confirmPassword && confirmPassword !== password ? 'Passwords don’t match' : undefined}><PasswordInput id="pw2" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} maxLength={128} required /></Field>
        <Button type="submit" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetInner /></Suspense>;
}
