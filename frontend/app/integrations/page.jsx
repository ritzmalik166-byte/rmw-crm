'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Landing URL after Facebook login (and a short link). Forwards, keeping ?meta=…&reason=…, to the Integrations
 * screen this user can open: Super Admin panel, else the CRM home Integrations page (integration.manage).
 */
export default function IntegrationsRedirect() {
  const { me, loading, can } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    const qs = window.location.search;
    if (!me) { router.replace(`/login?next=${encodeURIComponent(`/integrations${qs}`)}`); return; }
    if (me.areas?.superAdmin) router.replace(`/super-admin/integrations${qs}`);
    else if (can('integration.manage') || can('integration.view')) router.replace(`/crm/integrations${qs}`);
    else router.replace('/crm/dashboard');
  }, [me, loading, can, router]);
  return <div className="flex min-h-screen items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
}
