'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, apiMessage } from '@/lib/api';
import { AuthCard, FormError } from '@/components/auth/AuthCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await api('/auth/forgot-password', { method: 'POST', body: { email } }); setSent(true); } catch (err) { setError(apiMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthCard title="Reset your password" description="We'll email you a secure link to set a new password." footer={<Link href="/login" className="font-medium text-primary hover:underline">&larr; Back to sign in</Link>}>
      {sent ? (
        <div className="space-y-3 text-[14px] text-slate-700"><p>If an account exists for <span className="font-medium text-slate-900">{email}</span>, a reset link is on its way.</p><p className="text-[13px] text-slate-500">The link works once and expires soon. Nothing in your inbox after a few minutes? Check spam, or <button type="button" className="font-medium text-primary hover:underline" onClick={() => setSent(false)}>try another email</button>.</p></div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="Registered email" htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" /></Field>
          <Button type="submit" className="w-full" loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}
