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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/feedback';
import { skeletonFor } from '@/components/ui/skeletons';
import { UserAvatar } from '@/components/ui/avatar';

function LogoutDialog({ open, onOpenChange }) {
  const { logout, loggingOut } = useAuth();
  return (
    <Dialog open={open} onOpenChange={(v) => !loggingOut && onOpenChange(v)}>
      <DialogContent className="max-w-sm text-center sm:text-center" onInteractOutside={(e) => loggingOut && e.preventDefault()}>
        <DialogHeader className="items-center">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600"><LogOut className="h-5 w-5" /></span>
          <DialogTitle>Log out of RMW CRM?</DialogTitle>
          <DialogDescription>You will need to sign in again to access your leads.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button variant="outline" disabled={loggingOut} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={loggingOut} onClick={logout}>{loggingOut ? 'Logging out…' : 'Log out'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Full-page placeholder shaped like the app shell (used while the session loads). */
function ShellSkeleton({ path }) {
  return (
    <div className="min-h-screen">
      <div className="flex h-12 items-center gap-3 bg-[hsl(var(--primary))] px-4 [&>*]:bg-white/15">
        <Skeleton className="h-8 w-8 rounded-sm" />
        <div className="hidden space-y-1.5 bg-transparent sm:block [&>*]:bg-white/20"><Skeleton className="h-3 w-20" /><Skeleton className="h-2 w-44" /></div>
        <div className="ml-3 hidden gap-4 bg-transparent md:flex [&>*]:bg-white/20">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-3.5 w-16" />)}</div>
        <div className="ml-auto flex items-center gap-3 bg-transparent [&>*]:bg-white/20"><Skeleton className="h-5 w-5 rounded-full" /><Skeleton className="h-7 w-7 rounded-full" /><Skeleton className="hidden h-3 w-24 md:block" /></div>
      </div>
      <div className="h-[3px] bg-[hsl(var(--saffron))]" />
      <aside className="fixed bottom-0 left-0 top-[51px] hidden w-56 border-r bg-white py-3 lg:block">
        {[1, 4, 1, 2, 2].map((items, g) => (
          <div key={g} className="mb-3">
            {g > 0 && <Skeleton className="mx-4 mb-2 mt-3 h-2.5 w-24" />}
            {Array.from({ length: items }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-[9px]"><Skeleton className="h-4 w-4 shrink-0" /><Skeleton className="h-3 flex-1" />{g === 1 && i > 0 && <Skeleton className="h-3 w-8" />}</div>
            ))}
          </div>
        ))}
      </aside>
      <div className="lg:pl-56">
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
          {skeletonFor(path)}
        </main>
      </div>
    </div>
  );
}

/** Plain left-clicks only; ctrl/cmd/middle-click open a new tab and must not trigger the skeleton. */
const isPlainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

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
  const { me, can } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState(null);
  useEffect(() => { setPendingHref(null); }, [pathname]);
  const navigate = (href) => (e) => {
    setOpen(false);
    if (isPlainClick(e) && href !== pathname) setPendingHref(href);
  };
  const areaLabel = AREAS.find((a) => a.key === area)?.label;
  const needsCounts = nav.some((g) => g.items.some((i) => i.countKey));
  const { data: pipe } = useQuery({ queryKey: ['leads', 'pipelines'], queryFn: () => api('/crm/pipelines'), enabled: needsCounts, staleTime: 60_000 });
  const home = `/${area === 'superAdmin' ? 'super-admin' : area}/dashboard`;

  const sidebar = (
    <nav className="flex h-full flex-col bg-white">
      <div className="flex-1 overflow-y-auto py-2">
        {nav.filter((g) => g.items.some((i) => !i.hidden && (!i.perm || can(i.perm)))).map((group) => (
          <div key={group.title || 'main'} className="mb-1">
            {group.title && <p className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{group.title}</p>}
            <ul>
              {group.items.filter((i) => !i.hidden && (!i.perm || can(i.perm))).map((item) => {
                const active = item.exact ? pathname === item.href : (pathname === item.href || (item.href !== home && pathname.startsWith(`${item.href}/`)));
                const c = item.countKey ? pipe?.counts?.[item.countKey] : null;
                return (
                  <li key={item.href}>
                    <Link href={item.href} onClick={navigate(item.href)} className={cn('relative flex items-center gap-2.5 px-4 py-[7px] text-[13px] transition-colors',
                      active ? 'bg-[hsl(213_70%_95%)] font-semibold text-[hsl(var(--primary))] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[hsl(var(--primary))]' : 'text-slate-700 hover:bg-slate-50')}>
                      {item.logo ? <img src={item.logo} alt="" className="h-[18px] w-[18px] shrink-0 object-contain" /> : <item.icon className="h-4 w-4 shrink-0" />}
                      <span className="flex-1 truncate">{item.label}</span>
                      {c && <span className="tabular-nums text-[11px] text-slate-500">{c.total}</span>}
                      {c?.new_leads > 0 && <span className="rounded-sm bg-blue-600 px-1 text-[10px] font-semibold leading-4 text-white" title={`${c.new_leads} new`}>{c.new_leads}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-2 text-[10px] text-slate-400">RMW CRM · {areaLabel}</div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-[hsl(var(--primary))] text-white">
        <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
          <button className="rounded p-1 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Link href={home} className="flex items-center gap-2">
            <img src="/rmw-mark.png" alt="Ritz Media World" className="h-8 w-8 rounded-sm bg-white object-contain p-0.5" />
            <span className="hidden leading-tight sm:block">
              <span className="block text-[13px] font-semibold">RMW CRM</span>
              <span className="block text-[10px] text-white/70">Ritz Media World Group · Lead Management</span>
            </span>
          </Link>
          <div className="ml-3 hidden h-full items-stretch md:flex">
            {AREAS.filter((a) => me?.areas?.[a.key]).map((a) => (
              <Link key={a.key} href={a.href} onClick={navigate(a.href)} className={cn('flex items-center gap-1.5 border-b-2 px-3 text-[12px] font-medium', a.key === area ? 'border-[hsl(var(--saffron))] bg-white/10 text-white' : 'border-transparent text-white/75 hover:bg-white/5 hover:text-white')}>
                <a.icon className="h-3.5 w-3.5" />{a.label}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5 [&_button]:text-white [&_button:hover]:bg-white/10">
            <LiveDot />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded px-1.5 py-1">
                  <UserAvatar src={me?.user?.avatar} name={me?.user?.full_name} className="h-7 w-7 bg-white/15 text-white ring-1 ring-white/30" />
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block text-[12px] font-medium">{me?.user?.full_name}</span>
                    <span className="block text-[10px] text-white/70">{me?.roles?.[0]?.replace(/_/g, ' ').toLowerCase()}</span>
                  </span>
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
                <DropdownMenuItem onSelect={() => setLogoutOpen(true)}><LogOut />Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="h-[3px] bg-[hsl(var(--saffron))]" />
      </header>

      <aside className="fixed bottom-0 left-0 top-[51px] z-20 hidden w-56 border-r lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <div className="flex h-12 items-center justify-between bg-[hsl(var(--primary))] px-4 text-white">
              <span className="text-[13px] font-semibold">RMW CRM</span>
              <button onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <div className="h-[calc(100%-3rem)]">{sidebar}</div>
          </aside>
        </div>
      )}
      <div className="lg:pl-56">
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">{pendingHref ? skeletonFor(pendingHref) : children}</main>
      </div>
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </div>
  );
}

/** Wraps an area: requires sign-in and the area permission. The API enforces the same rules independently. */
export function AreaShell({ area, nav, children }) {
  const { me, loading, loggingOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!loading && !me && !loggingOut) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, me, loggingOut, router, pathname]);
  if (loggingOut && !me) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />Logging out…</div>;
  }
  if (loading || !me) return <ShellSkeleton path={pathname} />;
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
