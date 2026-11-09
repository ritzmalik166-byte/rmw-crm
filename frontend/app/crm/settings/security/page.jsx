'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, Smartphone, LogOut, ShieldCheck } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui/feedback';

const METHOD = { PASSWORD: 'Password (trusted device)', PASSWORD_OTP: 'Password + OTP', OTP: 'Mobile OTP' };

export default function SecurityPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['sessions'], queryFn: () => api('/auth/sessions') });
  const revoke = useMutation({
    mutationFn: (id) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Device signed out'); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/sessions/logout-all', { method: 'POST' }),
    onSuccess: (r) => { toast.success(`Signed out of ${r.revoked} other device(s)`); qc.invalidateQueries({ queryKey: ['sessions'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const others = data?.filter((s) => !s.current) || [];

  return (
    <>
      <PageHeader title="Security & devices" description="Devices signed in to your account. Signing in from a new device always requires an OTP sent to your mobile." />
      <Card className="max-w-3xl">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div><CardTitle>Active sessions</CardTitle><CardDescription className="mt-1">Signing out a device also removes its trusted status.</CardDescription></div>
          {others.length > 0 && <Button variant="outline" size="sm" onClick={() => confirm('Sign out of all other devices?') && logoutAll.mutate()} loading={logoutAll.isPending}><LogOut />Log out all other devices</Button>}
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : isError ? <ErrorState error={error} onRetry={refetch} /> : (
            <ul className="divide-y rounded-md border">
              {data.map((s) => {
                const Icon = /mobile|tablet|android|iphone|ipad/i.test(`${s.device_name} ${s.operating_system}`) ? Smartphone : Monitor;
                const trusted = s.is_trusted && s.trusted_until && new Date(s.trusted_until) > new Date();
                return (
                  <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <Icon className="mt-0.5 h-6 w-6 text-muted-foreground" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{s.device_name || 'Unknown device'}</p>
                          {s.current && <Badge variant="success">This device</Badge>}
                          {trusted && <Badge variant="info"><ShieldCheck className="mr-1 h-3 w-3" />Trusted until {formatDateTime(s.trusted_until).split(',')[0]}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{s.browser} · {s.operating_system} · IP {s.ip_address || '—'}</p>
                        <p className="text-xs text-muted-foreground">Last active {s.current ? 'now' : timeAgo(s.last_activity_at)} · Signed in {formatDateTime(s.created_at)} via {METHOD[s.auth_method] || s.auth_method}</p>
                      </div>
                    </div>
                    {!s.current && <Button variant="outline" size="sm" onClick={() => revoke.mutate(s.id)} loading={revoke.isPending && revoke.variables === s.id}>Log out device</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
