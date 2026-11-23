'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Wifi, Moon, WifiOff, Users, Monitor, Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo, formatDateTime, cn } from '@/lib/utils';
import { useAuth } from '@/providers/AuthProvider';
import { useSocket } from '@/providers/SocketProvider';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, PageHeader, TableSkeleton, StatCard } from '@/components/ui/feedback';

const ROLE_LABEL = { OWNER: 'Owner', SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin' };
const roleLabel = (code) => ROLE_LABEL[code] || (code ? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, ' ') : 'User');

const STATUS = {
  online: { label: 'Online', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  idle: { label: 'Idle', dot: 'bg-amber-400', text: 'text-amber-700' },
  offline: { label: 'Offline', dot: 'bg-slate-300', text: 'text-slate-500' },
};

/** Turns a CRM path into plain words: "/crm/leads/42" -> "Viewing lead #42". */
const PAGE_RULES = [
  [/^\/crm\/leads\/(\d+)/, (m) => `Viewing lead #${m[1]}`],
  [/^\/crm\/leads/, () => 'Leads list'],
  [/^\/crm\/followups/, () => 'Follow-ups'],
  [/^\/crm\/pipelines?/, () => 'Pipeline'],
  [/^\/crm\/dashboard|^\/crm\/?$/, () => 'CRM dashboard'],
  [/^\/crm\/settings/, () => 'Own settings'],
  [/^\/crm\/notifications/, () => 'Notifications'],
  [/^\/admin\/dashboard|^\/admin\/?$/, () => 'Admin dashboard'],
  [/^\/super-admin\/dashboard|^\/super-admin\/?$/, () => 'Super Admin dashboard'],
  [/^\/super-admin\/live-users/, () => 'Live users'],
  [/^\/(admin|super-admin)\/users/, () => 'Managing users'],
  [/^\/(admin|super-admin)\/analytics/, () => 'Analytics'],
  [/^\/(admin|super-admin)\/marketing/, () => 'Marketing (Meta)'],
  [/^\/(admin|super-admin)\/integrations/, () => 'Integrations'],
  [/^\/(admin|super-admin)\/settings/, () => 'System settings'],
  [/^\/(admin|super-admin)\/audit-logs/, () => 'Activity log'],
  [/^\/(admin|super-admin)\/teams/, () => 'Teams'],
  [/^\/super-admin\/security/, () => 'Sessions & security'],
];
function describePage(page) {
  if (!page) return null;
  const path = page.split('?')[0];
  for (const [re, fn] of PAGE_RULES) { const m = path.match(re); if (m) return fn(m); }
  return path;
}

function browserOf(ua) {
  if (!ua) return null;
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: os ? `${b} · ${os}` : b, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

function StatusCell({ row }) {
  const s = STATUS[row.status] || STATUS.offline;
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        {row.status === 'online' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', s.dot)} />
      </span>
      <div>
        <div className={cn('text-sm font-medium', s.text)}>{s.label}</div>
        <div className="text-xs text-muted-foreground">
          {row.status === 'offline'
            ? (row.lastSeenAt ? `Last seen ${timeAgo(row.lastSeenAt)}` : 'Never signed in')
            : `Since ${timeAgo(row.onlineSince)}${row.connections > 1 ? ` · ${row.connections} tabs` : ''}`}
        </div>
      </div>
    </div>
  );
}

export function LiveUsers() {
  const { me } = useAuth();
  const { socket, connected } = useSocket();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const isOwner = me?.roles?.includes('OWNER');

  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['sa', 'presence'],
    queryFn: () => api('/super-admin/presence'),
    enabled: !!isOwner,
    refetchInterval: 30_000, // also refreshes "x min ago" and idle detection
  });

  // Live: refetch (debounced) whenever someone connects, changes page, goes idle or acts.
  useEffect(() => {
    if (!socket || !isOwner) return undefined;
    let t;
    const onChange = () => { clearTimeout(t); t = setTimeout(() => qc.invalidateQueries({ queryKey: ['sa', 'presence'] }), 800); };
    socket.on('PRESENCE_CHANGED', onChange);
    return () => { clearTimeout(t); socket.off('PRESENCE_CHANGED', onChange); };
  }, [socket, isOwner, qc]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter((r) => (!statusFilter || r.status === statusFilter)
      && (!roleFilter || (roleFilter === 'USER' ? !r.roles.some((c) => ROLE_LABEL[c]) : r.roles.includes(roleFilter)))
      && (!q || `${r.fullName} ${r.email}`.toLowerCase().includes(q)));
  }, [data, search, statusFilter, roleFilter]);

  if (me && !isOwner) {
    return <EmptyState title="Owner only" description="Only the system Owner can see live user activity." />;
  }

  const sum = data?.summary;
  return (
    <>
      <PageHeader
        title="Live users"
        description="Who is using the CRM right now, what page they are on and their latest action. Visible to the Owner only."
        actions={<span className={cn('flex items-center gap-1.5 text-xs', connected ? 'text-emerald-700' : 'text-slate-500')}><span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-slate-300')} />{connected ? 'Live' : 'Reconnecting…'}{dataUpdatedAt ? ` · updated ${timeAgo(new Date(dataUpdatedAt))}` : ''}</span>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Online" value={sum?.online ?? '—'} icon={Wifi} tone="success" hint="Active in the last 2 minutes" />
        <StatCard label="Idle" value={sum?.idle ?? '—'} icon={Moon} tone="warning" hint="CRM open, tab in background" />
        <StatCard label="Offline" value={sum?.offline ?? '—'} icon={WifiOff} />
        <StatCard label="Total users" value={sum?.total ?? '—'} icon={Users} />
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative w-full max-w-sm"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Select className="w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option><option value="online">Online</option><option value="idle">Idle</option><option value="offline">Offline</option>
        </Select>
        <Select className="w-40" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option><option value="SUPER_ADMIN">Super Admins</option><option value="ADMIN">Admins</option><option value="USER">Users</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={6} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !rows.length ? <EmptyState title="No users match" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Status</TableHead><TableHead>Doing now</TableHead><TableHead>Last action</TableHead><TableHead>Device</TableHead><TableHead>Last login</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const dev = browserOf(r.userAgent);
                const DevIcon = dev?.mobile ? Smartphone : Monitor;
                return (
                  <TableRow key={r.id} className={cn(r.status === 'offline' && 'opacity-70')}>
                    <TableCell>
                      <div className="font-medium">{r.fullName}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(r.roles.length ? r.roles : ['USER']).map((c) => <Badge key={c} variant="outline">{roleLabel(c)}</Badge>)}
                        {r.accountStatus !== 'ACTIVE' && <Badge variant="outline">{r.accountStatus.toLowerCase().replace(/_/g, ' ')}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell><StatusCell row={r} /></TableCell>
                    <TableCell className="text-sm">
                      {r.status === 'offline' ? <span className="text-muted-foreground">—</span> : (
                        <>
                          <div>{describePage(r.page) || 'Opening the CRM…'}</div>
                          {r.status === 'idle' && <div className="text-xs text-amber-700">Tab in background</div>}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.lastAction ? <><div>{r.lastAction.label}</div><div className="text-xs text-muted-foreground">{timeAgo(r.lastAction.at)}</div></> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {dev ? <div className="flex items-center gap-1.5"><DevIcon className="h-3.5 w-3.5 text-muted-foreground" />{dev.label}</div> : <span className="text-muted-foreground">—</span>}
                      {r.ip && <div className="font-mono text-xs text-muted-foreground">{r.ip}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
