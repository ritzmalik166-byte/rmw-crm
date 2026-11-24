'use client';
import { useUiVersion } from '@/lib/useUiVersion';
import { LegacyAreaShell } from '@/components/legacy/AppShell';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Palette, Bell, LogOut, Menu, Settings, ShieldCheck, LayoutGrid, Briefcase, X, Loader2, ShieldAlert, Home, Users2, CalendarClock, Search, SunMedium, ChevronDown, CheckCheck, Sparkles, PanelLeftClose, PanelLeftOpen, ChevronRight, Check, ArrowLeft } from 'lucide-react';
import { RoleBadge } from '@/components/ui/badge';
import { ActivityLoader } from '@/components/layout/ActivityLoader';
import { AckReminder } from '@/components/leads/AckReminder';
import { VersionUpdate } from '@/components/layout/VersionUpdate';
import { CHANGELOG, SEEN_VERSION_KEY } from '@/lib/changelog';
import { useAuth } from '@/providers/AuthProvider';
import { SocketProvider, useSocket } from '@/providers/SocketProvider';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { useNewBadges, clearNew } from '@/lib/newLeadBadges';
import { Button } from '@/components/ui/button';
import { AppearanceDialog } from '@/components/layout/AppearanceDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/feedback';
import { skeletonFor } from '@/components/ui/skeletons';
import { UserAvatar } from '@/components/ui/avatar';
import { toast } from 'sonner';

const SIDEBAR_W = 'w-[248px]';
const CONTENT_PAD = 'lg:pl-[248px]';
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
const roleLabel = (me) => (me?.roles?.[0] || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

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

/** Brand block at the top of the sidebar. The mark sits on a white tile so its navy strokes stay visible. */
function Brand({ href, collapsed = false }) {
  return (
    <Link href={href} title={collapsed ? 'RMW CRM' : undefined} className={cn('flex items-center gap-3 pb-5 pt-6 [@media(max-height:760px)]:pb-3 [@media(max-height:760px)]:pt-4', collapsed ? 'justify-center px-0' : 'px-5')}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center">
        <img src="/rmw-mark.png" alt="Ritz Media World" className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgb(0_0_0/0.35)]" />
      </span>
      <span className={cn('whitespace-nowrap leading-tight', collapsed && 'hidden')}>
        <span className="block text-[15px] font-semibold tracking-tight text-white">RMW CRM</span>
        <span className="block text-[11.5px] text-white/55">Lead Management</span>
      </span>
    </Link>
  );
}

/**
 * Workspace switcher (CRM / Admin / Super Admin) for users with more than one area. Lives in the sidebar so the
 * header never runs out of room; shows the current workspace and opens a short menu of the others.
 */
function AreaSwitcher({ areas, area, onNavigate, collapsed = false }) {
  const current = areas.find((a) => a.key === area) || areas[0];
  const Icon = current.icon;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" title={collapsed ? `Workspace: ${current.label}` : undefined}
          className={cn('flex w-full min-w-0 items-center rounded-xl bg-white/[0.05] text-left outline-none ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.08] focus-visible:ring-white/40 data-[state=open]:bg-white/[0.09]',
            collapsed ? 'h-11 justify-center' : 'gap-2.5 px-3 py-2.5')}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-white/20 to-white/5 text-white"><Icon className="h-4 w-4" /></span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[10.5px] font-medium uppercase tracking-[0.1em] text-white/45">Workspace</span>
                <span className="block truncate text-[13px] font-semibold text-white">{current.label}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform [[data-state=open]_&]:rotate-180" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} sideOffset={collapsed ? 10 : 6} onCloseAutoFocus={(e) => e.preventDefault()}
        className={cn('p-1.5', collapsed ? 'w-60' : 'w-[max(var(--radix-dropdown-menu-trigger-width),15rem)] max-w-[calc(100vw-24px)]')}>
        <DropdownMenuLabel className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Switch workspace</DropdownMenuLabel>
        {areas.map((a) => {
          const on = a.key === area;
          return (
            <DropdownMenuItem key={a.key} asChild className={cn('gap-2.5 py-2', on && 'bg-[hsl(var(--accent))]')}>
              <Link href={a.href} onClick={onNavigate(a.href)} aria-current={on ? 'page' : undefined}>
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', on ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}><a.icon className="!size-4" /></span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn('block truncate text-[13px]', on ? 'font-semibold text-primary' : 'font-medium text-slate-800')}>{a.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{a.hint}</span>
                </span>
                {on && <Check className="!size-4 shrink-0 text-primary" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Full-page placeholder shaped like the app shell (used while the session loads). */
function ShellSkeleton({ path }) {
  return (
    <div className="min-h-screen">
      <aside className={cn('fixed inset-y-0 left-0 hidden bg-[hsl(var(--sidebar))] lg:block', SIDEBAR_W)}>
        <div className="flex items-center gap-3 px-5 pb-5 pt-6 [&>*]:bg-white/10"><Skeleton className="h-10 w-10 rounded-xl" /><div className="space-y-1.5 bg-transparent [&>*]:bg-white/10"><Skeleton className="h-3.5 w-20" /><Skeleton className="h-2.5 w-28" /></div></div>
        {[1, 5, 2, 1, 2].map((items, g) => (
          <div key={g} className="mb-2 px-3">
            {g > 0 && <Skeleton className="mx-2 mb-2 mt-4 h-2.5 w-24 bg-white/10" />}
            {Array.from({ length: items }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2.5"><Skeleton className="h-5 w-5 shrink-0 bg-white/10" /><Skeleton className="h-3 flex-1 bg-white/10" /></div>
            ))}
          </div>
        ))}
      </aside>
      <div className={CONTENT_PAD}>
        <div className="flex h-14 items-center gap-4 px-4 lg:h-[68px] lg:px-7">
          <Skeleton className="hidden h-10 w-[420px] rounded-xl lg:block" />
          <Skeleton className="h-8 w-8 rounded-xl lg:hidden" />
          <div className="ml-auto flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="hidden h-3.5 w-24 lg:block" /></div>
        </div>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:px-7">
          {skeletonFor(path)}
        </main>
      </div>
    </div>
  );
}

/** Plain left-clicks only; ctrl/cmd/middle-click open a new tab and must not trigger the skeleton. */
const isPlainClick = (e) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

const AREAS = [
  { key: 'crm', label: 'CRM', hint: 'Leads, follow-ups & pipelines', href: '/crm/dashboard', icon: Briefcase },
  { key: 'admin', label: 'Admin', hint: 'Users, teams & configuration', href: '/admin/dashboard', icon: LayoutGrid },
  { key: 'superAdmin', label: 'Super Admin', hint: 'Access, security & activity', href: '/super-admin/dashboard', icon: ShieldCheck },
];

/** Shared unread-notifications query (bell, sidebar count and phone tab bar all read the same cache entry). */
const useNotifications = (enabled = true) => useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api('/crm/notifications?limit=8'), refetchInterval: 120_000, enabled });

function NotificationBell() {
  const qc = useQueryClient();
  const { data } = useNotifications();
  const markAll = useMutation({ mutationFn: () => api('/crm/notifications/read-all', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const markOne = (id) => api(`/crm/notifications/${id}/read`, { method: 'POST' }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }));
  const unread = data?.unread || 0;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 outline-none ring-0 hover:bg-white hover:text-slate-900 hover:shadow-[0_1px_2px_rgb(16_24_40/0.06)] focus:outline-none focus-visible:bg-white data-[state=open]:bg-white data-[state=open]:text-slate-900" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-[20px] w-[20px]" strokeWidth={1.9} />
          {unread > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-[hsl(var(--page))]">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-[14px] font-semibold text-slate-900">Notifications</span>
          {unread > 0 && <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:text-[hsl(var(--primary)/0.8)]" onClick={() => markAll.mutate()}><CheckCheck className="h-3.5 w-3.5" />Mark all as read</button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!data?.rows?.length && <p className="px-4 py-10 text-center text-[13px] text-slate-500">You are all caught up.</p>}
          {data?.rows?.map((n) => (
            <DropdownMenuItem key={n.id} asChild className="block rounded-none border-b border-slate-100 px-4 py-3 last:border-0">
              <Link href={n.link || '/crm/notifications'} onClick={() => !n.read_at && markOne(n.id)}>
                <div className="flex items-start gap-2.5">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-slate-900">{n.title}</p>
                    {n.body && <p className="line-clamp-2 text-[12px] text-slate-500">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </Link>
            </DropdownMenuItem>
          ))}
        </div>
        <div className="border-t border-slate-100 p-1"><DropdownMenuItem asChild className="justify-center text-[12.5px] font-medium text-primary"><Link href="/crm/notifications">View all notifications</Link></DropdownMenuItem></div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Header search: searches leads (name, phone, email, ID). ⌘K / Ctrl+K focuses it from anywhere. */
function SearchBox({ onNavigate }) {
  const router = useRouter();
  const ref = useRef(null);
  const [q, setQ] = useState('');
  const [mac, setMac] = useState(true);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.focus(); ref.current?.select(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    const href = term ? `/crm/leads?search=${encodeURIComponent(term)}` : '/crm/leads';
    onNavigate(href);
    router.push(href);
    ref.current?.blur();
  };
  return (
    <form onSubmit={submit} role="search" className="group relative hidden min-w-0 max-w-[460px] flex-1 lg:block">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400 group-focus-within:text-primary" strokeWidth={1.9} />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }}
        placeholder="Search leads, names, phone, or ID…"
        aria-label="Search leads"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-16 text-[13.5px] text-slate-900 shadow-[0_1px_2px_rgb(16_24_40/0.04)] outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-[hsl(var(--primary)/0.5)] focus:shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">{mac ? '⌘ K' : 'Ctrl K'}</kbd>
    </form>
  );
}

/**
 * Phones / tablets (below lg): a search icon in the top bar that expands into a full-width
 * search field over the header row. Same destination as the desktop SearchBox.
 */
function MobileSearch({ onNavigate }) {
  const router = useRouter();
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  const close = () => { setOpen(false); setQ(''); };
  const submit = (e) => {
    e.preventDefault();
    const term = q.trim();
    const href = term ? `/crm/leads?search=${encodeURIComponent(term)}` : '/crm/leads';
    onNavigate(href);
    router.push(href);
    close();
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search leads"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-white hover:text-slate-900 lg:hidden">
        <Search className="h-[20px] w-[20px]" strokeWidth={1.9} />
      </button>
      {open && (
        <form onSubmit={submit} role="search"
          className="crm-fade absolute inset-x-0 bottom-0 z-10 flex h-14 items-center gap-2 bg-white px-3 shadow-[0_4px_16px_-12px_rgb(16_24_40/0.25)] sm:px-5 md:h-[4.25rem] lg:hidden">
          <button type="button" onClick={close} aria-label="Close search" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#475569] hover:!bg-slate-100 hover:!text-[#0f172a]">
            <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
          <input
            ref={ref}
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
            onBlur={() => { if (!q.trim()) setOpen(false); }}
            placeholder="Search leads, names, phone, ID…"
            aria-label="Search leads"
            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-[16px] text-[#0f172a] outline-none placeholder:text-slate-400 focus:border-[hsl(var(--primary)/0.5)] focus:bg-white"
          />
        </form>
      )}
    </>
  );
}

/** Shows a one-time welcome toast right after sign-in (flag set by the login page). */
function useLoginToast(me) {
  useEffect(() => {
    if (!me?.user) return;
    let flag = null;
    try { flag = sessionStorage.getItem('crm:justLoggedIn'); sessionStorage.removeItem('crm:justLoggedIn'); } catch { /* storage blocked */ }
    if (!flag) return;
    const first = (me.user.full_name || '').split(' ')[0];
    toast.success(`Welcome back${first ? `, ${first}` : ''}!`, { description: 'You are signed in and online.' });
  }, [me?.user]);
}

/** Phone/tablet bottom tab bar, like a native app. Hidden on desktop where the sidebar is shown. */
function BottomTabs({ area, items, home, pathname, onNavigate, onMenu }) {
  const { data: notif } = useNotifications(area === 'crm');
  const tabs = area === 'crm'
    ? [
      { href: '/crm/dashboard', label: 'Home', icon: Home, match: ['/crm/dashboard'] },
      { href: '/crm/lead-hub', label: 'Leads', icon: Users2, match: ['/crm/lead-hub', '/crm/leads', '/crm/pipeline', '/crm/meta', '/crm/client-leads'] },
      { href: '/crm/followups', label: 'Follow-ups', icon: CalendarClock, match: ['/crm/followups'] },
      { href: '/crm/notifications', label: 'Alerts', icon: Bell, match: ['/crm/notifications'], badge: notif?.unread },
    ]
    : items.filter((i) => i.icon).slice(0, 4).map((i) => ({ ...i, label: i.label.split(' ')[0], match: [i.href] }));
  const isActive = (t) => t.match.some((m) => pathname === m || (m !== home && pathname.startsWith(`${m}/`)) || (m === home && pathname === home));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[max(env(safe-area-inset-bottom),14px)] pt-1 shadow-[0_-4px_20px_rgba(16,24,40,0.06)] backdrop-blur-md md:pb-[max(env(safe-area-inset-bottom),18px)] lg:hidden" aria-label="Main">
      <ul className="mx-auto flex max-w-xl md:max-w-3xl">
        {tabs.map((t) => {
          const active = isActive(t);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} onClick={onNavigate(t.href)} className={cn('relative flex h-[54px] flex-col items-center justify-center gap-1 text-[11px] font-semibold md:h-[60px] md:text-[12.5px]', active ? 'text-primary' : 'text-slate-500')}>
                <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-300 md:h-8 md:w-16', active && 'bg-[hsl(var(--accent))]')}>
                  <t.icon className={cn('h-[20px] w-[20px] md:h-[23px] md:w-[23px]', active && 'stroke-[2.4]')} />
                  {t.badge > 0 && <span className="absolute -top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">{t.badge > 99 ? '99+' : t.badge}</span>}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" onClick={onMenu} className="flex h-[54px] w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 md:h-[60px] md:text-[12.5px]">
            <span className="flex h-7 w-12 items-center justify-center rounded-full"><Menu className="h-[20px] w-[20px] md:h-[23px] md:w-[23px]" /></span>Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}

function Shell({ area, nav, children }) {
  const { me, can } = useAuth();
  useLoginToast(me);
  // Pipeline links (website: 'MPF' …) only for websites this user can access; Owner / Super Admin get all of them.
  const myWebsites = new Set((me?.websites || []).map((w) => w.code));
  const show = (i) => !i.hidden && (!i.perm || can(i.perm)) && (!i.website || myWebsites.has(i.website));
  const { connected } = useSocket();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  // Desktop sidebar can collapse to an icon rail; remembered per browser. Ctrl/⌘+B toggles it.
  const [collapsed, setCollapsed] = useState(false);
  // A saved choice wins; without one the sidebar follows the screen: icon rail on laptops (< 1280px), full above.
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('crm:sidebarCollapsed'); } catch { /* storage blocked */ }
    if (saved !== null) { setCollapsed(saved === '1'); return undefined; }
    const mq = window.matchMedia('(max-width: 1279px)');
    const sync = () => setCollapsed(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const toggleSidebar = () => setCollapsed((v) => {
    try { localStorage.setItem('crm:sidebarCollapsed', v ? '0' : '1'); } catch { /* storage blocked */ }
    return !v;
  });
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b' && !e.target.closest?.('input, textarea, [contenteditable="true"]')) { e.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Wheel over the sidebar scrolls only the sidebar's own list, never the page behind it (also at the list's ends
  // and over the brand / workspace blocks, which aren't scrollable themselves).
  const asideRef = useRef(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.ctrlKey) return; // pinch-zoom
      e.preventDefault();
      const list = el.querySelector('[data-sidebar-scroll]');
      if (list) list.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // Phone drawer open: freeze the page behind it.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  // "What's new": the footer card shows a New tag until this browser has opened the current version's notes.
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [unseenUpdate, setUnseenUpdate] = useState(false);
  useEffect(() => {
    try { setUnseenUpdate(localStorage.getItem(SEEN_VERSION_KEY) !== APP_VERSION); } catch { /* storage blocked */ }
  }, []);
  const openWhatsNew = () => {
    setOpen(false);
    setWhatsNewOpen(true);
    setUnseenUpdate(false);
    try { localStorage.setItem(SEEN_VERSION_KEY, APP_VERSION); } catch { /* storage blocked */ }
  };
  useEffect(() => { setPendingHref(null); }, [pathname]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const navigate = (href) => (e) => {
    setOpen(false);
    if (!e || isPlainClick(e)) { if (href !== pathname) setPendingHref(href); }
  };
  const areaLabel = AREAS.find((a) => a.key === area)?.label;
  const home = `/${area === 'superAdmin' ? 'super-admin' : area}/dashboard`;
  const areas = AREAS.filter((a) => me?.areas?.[a.key]);
  const { data: notif } = useNotifications(Boolean(me?.areas?.crm));
  const counts = { notifications: notif?.unread || 0 };
  // "New" tags: set by live NEW_LEAD events, cleared when the section is opened.
  const badges = useNewBadges();
  useEffect(() => {
    nav.forEach((g) => g.items.forEach((i) => {
      if (i.badgeKey && (pathname === i.href || pathname.startsWith(`${i.href}/`))) clearNew(i.badgeKey);
    }));
  }, [pathname, nav, badges]);

  const renderSidebar = (rail) => (
    <nav className="flex h-full flex-col" aria-label="Sections">
      <div data-sidebar-scroll className={cn('flex-1 overflow-y-auto overscroll-contain pb-3 pt-1', rail ? 'px-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : 'px-3 [scrollbar-color:rgb(255_255_255/0.15)_transparent] [scrollbar-width:thin]')}>
        {nav.filter((g) => g.items.some((i) => show(i))).map((group, gi) => (
          <div key={group.title || 'main'} className="mb-1">
            {group.title && (rail
              ? gi > 0 && <div className="mx-2 my-3 h-px bg-white/10" aria-hidden />
              : <p className="px-3 pb-1.5 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">{group.title}</p>)}
            <ul className="space-y-0.5">
              {group.items.filter((i) => show(i)).map((item) => {
                const active = item.exact ? pathname === item.href : (pathname === item.href || (item.href !== home && pathname.startsWith(`${item.href}/`)));
                const isNew = Boolean(item.badgeKey && badges[item.badgeKey]) && !active;
                const count = item.countKey ? counts[item.countKey] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={navigate(item.href)}
                      aria-current={active ? 'page' : undefined}
                      title={rail ? item.label : undefined}
                      aria-label={rail ? item.label : undefined}
                      className={cn('group relative flex items-center rounded-xl text-[13.5px] font-medium outline-none transition-[background-color,color,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-white/30',
                        rail ? 'h-10 justify-center' : 'gap-3 px-3 py-2',
                        active ? 'bg-primary text-white shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.75)]' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white')}
                    >
                      {item.logo
                        ? <span className={cn('flex shrink-0 items-center justify-center', rail ? 'h-8 w-8' : 'h-7 w-7')}><img src={item.logo} alt="" className="h-full w-full object-contain" /></span>
                        : <item.icon className={cn('shrink-0', item.brandIcon ? 'h-[20px] w-[20px]' : 'h-[19px] w-[19px]', !item.brandIcon && (active ? 'text-white' : 'text-slate-400 group-hover:text-white'))} strokeWidth={1.9} />}
                      {rail ? (
                        (count > 0 || isNew) && <span className={cn('absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-[hsl(var(--sidebar))]', count > 0 ? 'bg-red-500' : 'bg-blue-400')} />
                      ) : (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {count > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10.5px] font-semibold text-white">{count > 99 ? '99+' : count}</span>}
                          {isNew && <span className="rounded-full bg-blue-500/20 px-2 text-[10px] font-semibold uppercase leading-[18px] tracking-wide text-blue-200 ring-1 ring-inset ring-blue-400/40" title="New leads arrived">New</span>}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {rail ? (
        <div className="flex flex-col items-center gap-1 p-2.5 pt-0">
          <button type="button" onClick={openWhatsNew} title={`v${APP_VERSION} · ${connected ? 'Live' : 'Reconnecting…'} · What’s new`}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-white/70 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08] hover:text-white">
            <Sparkles className="h-4 w-4" />
            <span className={cn('absolute right-1 top-1 h-2 w-2 rounded-full', unseenUpdate ? 'bg-blue-400' : connected ? 'bg-emerald-400' : 'bg-amber-400')} />
          </button>
        </div>
      ) : (
      <div className="p-3 pt-0">
        <button type="button" onClick={openWhatsNew} title={connected ? 'Live updates connected · see what’s new' : 'Reconnecting to live updates… · see what’s new'}
          className="group w-full rounded-xl bg-white/[0.04] px-3.5 py-3 text-left ring-1 ring-inset ring-white/10 hover:bg-white/[0.07]">
          <p className="flex items-center gap-2 text-[12px] font-medium text-white/80">
            <span className={cn('h-2 w-2 shrink-0 rounded-full transition-colors duration-500', connected ? 'bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.18)]' : 'bg-amber-400 shadow-[0_0_0_3px_rgb(251_191_36/0.18)]')} />
            <span className="flex-1 truncate">RMW CRM · {areaLabel}</span>
            {unseenUpdate && <span className="rounded-full bg-blue-500/20 px-1.5 text-[9.5px] font-semibold uppercase leading-4 tracking-wide text-blue-200 ring-1 ring-inset ring-blue-400/40">New</span>}
          </p>
          <p className="mt-1 flex items-center gap-1 pl-4 text-[11px] text-white/40">
            v{APP_VERSION} · {connected ? 'Live' : 'Reconnecting…'}
            <span className="ml-auto text-white/50 underline-offset-2 group-hover:underline">What&apos;s new</span>
          </p>
        </button>
      </div>
      )}
    </nav>
  );

  const visibleItems = nav.flatMap((g) => g.items).filter((i) => show(i));
  // Phones / tablets: a back arrow on every page except the bottom-tab roots.
  const TAB_ROOTS = [home, '/crm/dashboard', '/crm/lead-hub', '/crm/followups', '/crm/notifications'];
  const showBack = !TAB_ROOTS.includes(pathname);
  const parentOf = (p) => (p.startsWith('/crm/pipeline/') ? '/crm/lead-hub/website'
    : p.startsWith('/crm/lead-hub/') || p.startsWith('/crm/meta') || p.startsWith('/crm/leads') || p.startsWith('/crm/client-leads') ? '/crm/lead-hub' : home);
  const goBack = () => { if (window.history.length > 1) router.back(); else router.push(parentOf(pathname)); };
  const pageTitle = /\/leads\/\d+/.test(pathname) ? 'Lead details' : pathname === '/crm/lead-hub' ? 'Leads' : pathname === '/crm/lead-hub/website' ? 'Website / App'
    : [...visibleItems].sort((a, b) => b.href.length - a.href.length)
      .find((i) => pathname === i.href || (!i.exact && pathname.startsWith(`${i.href}/`)))?.label || areaLabel;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside ref={asideRef} className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden overscroll-contain bg-[hsl(var(--sidebar))] transition-[width] duration-300 ease-out lg:flex', collapsed ? 'w-[76px]' : SIDEBAR_W)}>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(420px_260px_at_0%_100%,hsl(221_83%_53%/0.14),transparent_70%)]" />
        <div className="relative"><Brand href={home} collapsed={collapsed} /></div>
        {areas.length > 1 && <div className={cn('relative mb-3 border-b border-white/10 pb-3', collapsed ? 'px-2.5' : 'px-3')}><AreaSwitcher areas={areas} area={area} onNavigate={navigate} collapsed={collapsed} /></div>}
        <div className="relative min-h-0 flex-1">{renderSidebar(collapsed)}</div>
      </aside>

      {/* Phone / tablet drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/50 animate-in fade-in-0 duration-300" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col overscroll-contain bg-[hsl(var(--sidebar))] shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="flex items-start justify-between px-5 pb-4 pt-[calc(env(safe-area-inset-top)+18px)]">
              <div className="flex items-center gap-3">
                <span className="relative">
                  <UserAvatar src={me?.user?.avatar} name={me?.user?.full_name} className="h-11 w-11 bg-white/10 text-white ring-2 ring-white/15" />
                  <span className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-[hsl(var(--sidebar))]', connected ? 'bg-emerald-400' : 'bg-amber-400')} />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[15px] font-semibold text-white">{me?.user?.full_name}</span>
                  <span className="block truncate text-[12px] text-white/55">{roleLabel(me)}</span>
                </span>
              </div>
              <button type="button" className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            {areas.length > 1 && (
              <div className="px-4 pb-2">
                <p className="px-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/40">Workspace</p>
                <div className="grid gap-1 rounded-xl bg-white/[0.06] p-1 ring-1 ring-inset ring-white/10" style={{ gridTemplateColumns: `repeat(${areas.length}, minmax(0, 1fr))` }}>
                  {areas.map((a) => (
                    <Link key={a.key} href={a.href} onClick={navigate(a.href)} aria-current={a.key === area ? 'page' : undefined}
                      className={cn('flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11.5px] font-semibold transition-colors', a.key === area ? 'bg-white text-slate-900 shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white')}>
                      <a.icon className="h-4 w-4 shrink-0" /><span className="w-full truncate text-center">{a.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <div className="min-h-0 flex-1">{renderSidebar(false)}</div>
            <button type="button" onClick={() => { setOpen(false); setLogoutOpen(true); }} className="flex items-center gap-3 border-t border-white/10 px-6 py-3.5 pb-[calc(env(safe-area-inset-bottom)+14px)] text-[14px] font-medium text-red-300 hover:bg-white/[0.04]">
              <LogOut className="h-4 w-4" />Log out
            </button>
          </aside>
        </div>
      )}

      <ActivityLoader navigating={Boolean(pendingHref)} />
      {area === 'crm' && <AckReminder />}
      <div className={cn('min-w-0 transition-[padding] duration-300 ease-out', collapsed ? 'lg:pl-[76px]' : CONTENT_PAD)}>
        <header className={cn('crm-topbar sticky top-0 z-20 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color,box-shadow] duration-300',
          scrolled ? 'border-slate-200/80 bg-white/85 shadow-[0_4px_16px_-12px_rgb(16_24_40/0.18)] backdrop-blur-md' : 'border-transparent bg-[hsl(var(--page))]')}>
          <div className="relative flex h-14 min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:h-[72px] lg:gap-5 lg:px-7">
            {/* Phones / tablets: back arrow (inner pages) + brand tile + page title */}
            {showBack && (
              <button type="button" onClick={goBack} aria-label="Back" className="-ml-2 -mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 hover:bg-white lg:hidden">
                <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
              </button>
            )}
            <Link href={home} className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center"><img src="/rmw-mark.png" alt="Ritz Media World" className="h-full w-full object-contain" /></span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[16px] font-semibold text-slate-900">{pageTitle}</span>
                <span className="block text-[10.5px] text-slate-500">RMW CRM · {areaLabel}</span>
              </span>
            </Link>

            <button type="button" onClick={toggleSidebar} title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={!collapsed}
              className="-ml-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 outline-none transition-colors hover:bg-white hover:text-slate-900 hover:shadow-[0_1px_2px_rgb(16_24_40/0.06)] focus-visible:bg-white lg:flex">
              {collapsed ? <PanelLeftOpen className="h-[20px] w-[20px]" strokeWidth={1.9} /> : <PanelLeftClose className="h-[20px] w-[20px]" strokeWidth={1.9} />}
            </button>

            {me?.areas?.crm && <SearchBox onNavigate={(href) => href !== pathname && setPendingHref(href)} />}

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              {me?.areas?.crm && <MobileSearch onNavigate={(href) => href !== pathname && setPendingHref(href)} />}
              <button type="button" onClick={() => setAppearanceOpen(true)} aria-label="Appearance" title="Appearance"
                className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_1px_2px_rgb(16_24_40/0.06)] sm:flex">
                <SunMedium className="h-[20px] w-[20px]" strokeWidth={1.9} />
              </button>
              <NotificationBell />
              <span aria-hidden className="mx-2 hidden h-8 w-px bg-slate-200 lg:block" />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 outline-none transition-colors hover:bg-white focus:outline-none focus-visible:bg-white data-[state=open]:bg-white data-[state=open]:shadow-[0_1px_3px_rgb(16_24_40/0.08)] lg:pr-3">
                    <span className="relative">
                      <UserAvatar src={me?.user?.avatar} name={me?.user?.full_name} className="h-9 w-9 lg:h-10 lg:w-10" />
                      <span className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white transition-colors duration-500', connected ? 'bg-emerald-500' : 'bg-amber-400')} />
                    </span>
                    <span className="hidden max-w-[160px] text-left leading-tight lg:block">
                      <span className="block truncate whitespace-nowrap text-[13.5px] font-semibold text-slate-900">{me?.user?.full_name}</span>
                      <span className="block truncate whitespace-nowrap text-[11.5px] text-slate-500">{roleLabel(me)}</span>
                    </span>
                    <ChevronDown className="hidden h-4 w-4 text-slate-400 transition-transform lg:block [[data-state=open]>&]:rotate-180" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} onCloseAutoFocus={(e) => e.preventDefault()} className="w-[300px] max-w-[calc(100vw-24px)] p-0">
                  {/* Identity card */}
                  <div className="relative overflow-hidden">
                    <div aria-hidden className="h-16 bg-[linear-gradient(120deg,hsl(var(--sidebar)),hsl(var(--primary))_70%,#38bdf8)]" />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-16 bg-[radial-gradient(160px_60px_at_85%_0%,rgb(255_255_255/0.35),transparent)]" />
                    <div className="-mt-8 px-4 pb-3">
                      <span className="relative inline-block">
                        <UserAvatar src={me?.user?.avatar} name={me?.user?.full_name} className="h-14 w-14 ring-4 ring-white shadow-md" />
                        <span className={cn('absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-white', connected ? 'bg-emerald-500' : 'bg-amber-400')} />
                      </span>
                      <p className="mt-1.5 truncate text-[15px] font-semibold text-slate-900">{me?.user?.full_name}</p>
                      <p className="truncate text-[12px] text-slate-500">{me?.user?.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(me?.roles || []).slice(0, 2).map((r) => <RoleBadge key={r} code={r} />)}
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', connected ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200')}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-amber-500')} />{connected ? 'Online' : 'Reconnecting'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 p-1.5">
                    {[
                      { href: '/crm/settings', icon: Settings, label: 'Account settings', hint: 'Profile, photo & contact details' },
                      { href: '/crm/settings/security', icon: ShieldCheck, label: 'Security & devices', hint: 'Password, sessions & trusted devices' },
                    ].map((it) => (
                      <DropdownMenuItem key={it.href} asChild className="gap-3 px-2 py-2">
                        <Link href={it.href} onClick={navigate(it.href)}>
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><it.icon className="!size-4" /></span>
                          <span className="min-w-0 flex-1 leading-tight"><span className="block text-[13px] font-medium text-slate-800">{it.label}</span><span className="block truncate text-[11px] text-slate-500">{it.hint}</span></span>
                          <ChevronRight className="!size-3.5 text-slate-300" />
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onSelect={() => setAppearanceOpen(true)} className="gap-3 px-2 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Palette className="!size-4" /></span>
                      <span className="min-w-0 flex-1 leading-tight"><span className="block text-[13px] font-medium text-slate-800">Appearance</span><span className="block truncate text-[11px] text-slate-500">Accent, density & text size</span></span>
                      <ChevronRight className="!size-3.5 text-slate-300" />
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openWhatsNew} className="gap-3 px-2 py-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent))] text-primary"><Sparkles className="!size-4" /></span>
                      <span className="min-w-0 flex-1 leading-tight"><span className="block text-[13px] font-medium text-slate-800">What&apos;s new</span><span className="block truncate text-[11px] text-slate-500">Version {APP_VERSION}</span></span>
                      {unseenUpdate && <span className="rounded-full bg-blue-50 px-1.5 text-[10px] font-semibold uppercase leading-4 text-blue-700 ring-1 ring-inset ring-blue-200">New</span>}
                    </DropdownMenuItem>
                  </div>
                  <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 lg:flex">
                    <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans">Ctrl K</kbd> search</span>
                    <span><kbd className="rounded border border-slate-200 bg-slate-50 px-1 font-sans">Ctrl B</kbd> sidebar</span>
                  </div>
                  <div className="border-t border-slate-100 p-1.5">
                    <DropdownMenuItem onSelect={() => setLogoutOpen(true)} className="gap-3 px-2 py-2 text-red-600 focus:bg-red-50 focus:text-red-700">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><LogOut className="!size-4" /></span>
                      <span className="text-[13px] font-medium">Log out</span>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <AppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />

        <main className="mx-auto max-w-[1500px] px-4 pb-[calc(max(env(safe-area-inset-bottom),14px)+88px)] pt-4 sm:px-6 sm:pt-5 md:pb-[calc(max(env(safe-area-inset-bottom),18px)+100px)] lg:px-7 lg:pb-10 lg:pt-2">{pendingHref ? skeletonFor(pendingHref) : children}</main>
      </div>
      <BottomTabs area={area} items={visibleItems} home={home} pathname={pathname} onNavigate={navigate} onMenu={() => setOpen(true)} />
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
      <WhatsNewDialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />
    </div>
  );
}

/** Release notes from lib/changelog.js, newest first. */
function WhatsNewDialog({ open, onOpenChange }) {
  const fmt = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-primary"><Sparkles className="h-5 w-5" /></span>
          <DialogTitle>What&apos;s new in RMW CRM</DialogTitle>
          <DialogDescription>You are on version {APP_VERSION}.</DialogDescription>
        </DialogHeader>
        <ol className="-mx-1 max-h-[60vh] space-y-5 overflow-y-auto px-1">
          {CHANGELOG.map((r, i) => (
            <li key={r.version} className={cn('relative border-l-2 pl-4', i === 0 ? 'border-primary' : 'border-slate-200')}>
              <p className="flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', i === 0 ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600')}>v{r.version}</span>
                <span className="text-[14px] font-semibold text-slate-900">{r.title}</span>
              </p>
              {r.date && <p className="mt-0.5 text-[11.5px] text-slate-400">{fmt(r.date)}</p>}
              <ul className="mt-2 space-y-1.5">
                {r.items.map((t) => (
                  <li key={t} className="flex gap-2 text-[13px] leading-snug text-slate-600"><CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{t}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

/** Wraps an area: requires sign-in and the area permission. The API enforces the same rules independently. */
function AreaShellV2({ area, nav, children }) {
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

/** 1.0 users get the pre-2.0 shell until they install the update. */
export function AreaShell(props) {
  const v = useUiVersion(); // account choice first, then this browser (lib/useUiVersion)
  if (v === null) return null;
  return <>{v === 2 ? <AreaShellV2 {...props} /> : <LegacyAreaShell {...props} />}{props.area === 'crm' && <VersionUpdate />}</>;
}
