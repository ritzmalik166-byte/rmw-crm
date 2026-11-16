'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

/**
 * Short, area-independent URLs (/settings/integrations, /marketing/meta) that forward to the page inside the
 * highest area the user can open: Super Admin, then Admin, else the CRM dashboard.
 */
export function AreaRedirect({ path }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    if (me.areas?.superAdmin) router.replace(`/super-admin${path}`);
    else if (me.areas?.admin) router.replace(`/admin${path}`);
    else router.replace('/crm/dashboard');
  }, [me, loading, path, router]);
  return <div className="flex min-h-screen items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>;
}
