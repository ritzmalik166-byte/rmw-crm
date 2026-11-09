'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Settings, ShieldCheck, LayoutGrid, Briefcase, X, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { SocketProvider, useSocket } from '@/providers/SocketProvider';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/controls';

const AREAS = [
  { key: 'crm', label: 'CRM', href: '/crm/dashboard', icon: Briefcase },
  { key: 'admin', label: 'Admin', href: '/admin/dashboard', icon: LayoutGrid },
  { key: 'superAdmin', label: 'Super Admin', href: '/super-admin/dashboard', icon: ShieldCheck },
];

function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api('/crm/notifications?limit=8'), refetchInterval: 120_000 });
  const markAll = useMutation({ mutationFn: () => api('/crm/notifications/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const markOne = (id) => api(`/crm/notifications/${id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  const unread = data?.unread || 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => markAll.mutate()}>Mark all as read</button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!data?.rows?.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">You are all caught up.</p>}
          {data?.rows?.map((n) => (
            <DropdownMenuItem key={n.id} asChild className="block rounded-none border-b px-3 py-2.5 last:border-0">
              <Link href={n.link || '/crm/notifications'} onClick={() => !n.read_at && markOne(n.id)}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  <div className={cn('min-w-0', n.read_at && 'pl-4')}>
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        <div className="border-t p-1"><DropdownMenuItem asChild className="justify-center text-xs"><Link href="/crm/notifications">View all</Link></DropdownMenuItem></div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LiveDot() {
  const { connected } = useSocket();
  return <span title={connected ? 'Live updates connected' : 'Live updates reconnecting'} className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300')} />;
}

function Shell({ area, nav, children }) {
  const { me, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const areaLabel = AREAS.find((a) => a.key === area)?.label;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <p className="text-sm font-semibold">RMW CRM</p>
          <p className="text-[11px] text-muted-foreground">{areaLabel}</p>
        </div>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-3">
        {nav.map((group) => (
          <div key={group.title || 'main'}>
            {group.title && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</p>}
            <ul className="space-y-0.5">
              {group.items.filter((i) => !i.hidden).map((item) => {
                const active = pathname === item.href || (item.href !== `/${area === 'superAdmin' ? 'super-admin' : area}/dashboard` && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setOpen(false)} className={cn('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors', active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}>
                      <item.icon className="h-4 w-4" />{item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-3 top-4" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></Button>
          <div className="hidden items-center gap-1 rounded-lg bg-slate-100 p-1 sm:flex">
            {AREAS.filter((a) => me?.areas?.[a.key]).map((a) => (
              <Link key={a.key} href={a.href} className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', a.key === area ? 'bg-white shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                <a.icon className="h-3.5 w-3.5" />{a.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LiveDot />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{me?.user?.full_name?.[0]?.toUpperCase()}</span>
                  <span className="hidden text-sm font-medium md:block">{me?.user?.full_name}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{me?.user?.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{me?.user?.email}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{me?.roles?.join(', ').replace(/_/g, ' ')}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/crm/settings"><Settings />Settings</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/crm/settings/security"><ShieldCheck />Security &amp; devices</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout}><LogOut />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Wraps an area: requires sign-in and the area permission. The API enforces the same rules independently. */
export function AreaShell({ area, nav, children }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, me, router, pathname]);
  if (loading || !me) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!me.areas?.[area]) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold">You do not have access to this area</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Ask a Super Admin if you need access.</p>
        <Button asChild variant="outline"><Link href="/crm/dashboard">Go to CRM</Link></Button>
      </div>
    );
  }
  return <SocketProvider><Shell area={area} nav={nav}>{children}</Shell></SocketProvider>;
}
