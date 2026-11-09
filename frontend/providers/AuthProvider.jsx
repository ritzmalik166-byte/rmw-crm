'use client';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const AuthContext = createContext(null);
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  const { data: me, isLoading, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me'),
    enabled: !isPublic,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onUnauthorized = () => {
      qc.clear();
      if (!PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      }
    };
    window.addEventListener('crm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('crm:unauthorized', onUnauthorized);
  }, [qc, router]);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  const value = useMemo(() => {
    const perms = new Set(me?.permissions || []);
    return {
      me: me || null,
      loading: !isPublic && isLoading,
      can: (...p) => p.every((x) => perms.has(x)),
      canAny: (...p) => p.some((x) => perms.has(x)),
      refetch,
      logout,
    };
  }, [me, isLoading, isPublic, refetch, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
