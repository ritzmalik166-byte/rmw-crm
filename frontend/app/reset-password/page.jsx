'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setError(''); setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password, confirmPassword } });
      toast.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  if (!token) {
    return <AuthCard title="Invalid link" footer={<Link href="/forgot-password" className="hover:text-foreground">Request a new link</Link>}><p className="text-sm text-muted-foreground">This reset link is missing its token.</p></AuthCard>;
  }

  return (
    <AuthCard title="Set a new password" description="All other sessions will be signed out.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="New password" htmlFor="pw" hint="10+ characters with upper, lower case and a number"><Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus /></Field>
        <Field label="Confirm password" htmlFor="pw2"><Input id="pw2" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required /></Field>
        <Button type="submit" className="w-full" loading={busy}>Update password</Button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetInner /></Suspense>;
}
