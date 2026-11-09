'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, LogOut, Database, Server, MessageSquare, Mail, BellRing, CheckCircle2, XCircle } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import { formatDateTime, timeAgo, toQuery, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton, Skeleton, StatCard } from '@/components/ui/feedback';

const parsePerms = (p) => (typeof p === 'string' ? JSON.parse(p || '[]') : p || []);

/* ---------------- Roles ---------------- */
export function RolesManager() {
  const qc = useQueryClient();
  const { data: roles, isLoading } = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') });
  const { data: perms } = useQuery({ queryKey: ['sa', 'permissions'], queryFn: () => api('/super-admin/permissions') });
  const [create, setCreate] = useState(null);
  const m = useMutation({
    mutationFn: (r) => api('/super-admin/roles', { method: 'POST', body: { ...r, level: Number(r.level) } }),
    onSuccess: () => { toast.success('Role created'); qc.invalidateQueries({ queryKey: ['admin', 'roles'] }); setCreate(null); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <>
      <PageHeader title="Roles" description="Users can only grant roles below their own level. Edit what each role can do on the Permissions page." actions={<Button onClick={() => setCreate({ code: '', name: '', description: '', level: 20, permissionCodes: ['area.crm', 'lead.view'] })}><Plus />New role</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={5} /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Code</TableHead><TableHead>Level</TableHead><TableHead>Users</TableHead><TableHead>Permissions</TableHead></TableRow></TableHeader>
            <TableBody>
              {roles?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.description}</div></TableCell>
                  <TableCell className="font-mono text-xs">{r.code}{!!r.is_system && <Badge variant="outline" className="ml-2">system</Badge>}</TableCell>
                  <TableCell>{r.level}</TableCell>
                  <TableCell>{r.user_count}</TableCell>
                  <TableCell className="text-sm">{parsePerms(r.permissions).length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {create && (
        <Dialog open onOpenChange={(o) => !o && setCreate(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>New role</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Code" hint="e.g. TEAM_LEAD"><Input value={create.code} onChange={(e) => setCreate({ ...create, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><Input value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></Field>
              <Field label="Level" hint="1–99. Admin is 50, Normal User is 10."><Input type="number" min={1} max={99} value={create.level} onChange={(e) => setCreate({ ...create, level: e.target.value })} /></Field>
              <Field label="Description"><Input value={create.description} onChange={(e) => setCreate({ ...create, description: e.target.value })} /></Field>
            </div>
            <Field label="Permissions">
              <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                {perms?.filter((p) => p.code !== 'area.super_admin').map((p) => (
                  <label key={p.code} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={create.permissionCodes.includes(p.code)} onCheckedChange={(v) => setCreate({ ...create, permissionCodes: v ? [...create.permissionCodes, p.code] : create.permissionCodes.filter((c) => c !== p.code) })} />
                    <span className="font-mono">{p.code}</span>
                  </label>
                ))}
              </div>
            </Field>
            <DialogFooter><Button variant="outline" onClick={() => setCreate(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(create)}>Create role</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ---------------- Permissions matrix ---------------- */
export function PermissionsMatrix() {
  const qc = useQueryClient();
  const { data: roles, isLoading } = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') });
  const { data: perms } = useQuery({ queryKey: ['sa', 'permissions'], queryFn: () => api('/super-admin/permissions') });
  const [draft, setDraft] = useState({});
  useEffect(() => { if (roles) setDraft(Object.fromEntries(roles.map((r) => [r.id, new Set(parsePerms(r.permissions))]))); }, [roles]);
  const groups = useMemo(() => {
    const g = {};
    (perms || []).forEach((p) => { (g[p.group_name] ||= []).push(p); });
    return Object.entries(g);
  }, [perms]);
  const editable = (roles || []).filter((r) => r.code !== 'SUPER_ADMIN');
  const dirty = editable.filter((r) => {
    const a = [...(draft[r.id] || [])].sort().join(); const b = parsePerms(r.permissions).sort().join();
    return a !== b;
  });
  const save = useMutation({
    mutationFn: async () => { for (const r of dirty) await api(`/super-admin/roles/${r.id}/permissions`, { method: 'PUT', body: { permissionCodes: [...draft[r.id]] } }); },
    onSuccess: () => { toast.success('Permissions saved. Changes apply on the next request.'); qc.invalidateQueries({ queryKey: ['admin', 'roles'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const toggle = (roleId, code) => setDraft((d) => {
    const s = new Set(d[roleId]);
    s.has(code) ? s.delete(code) : s.add(code);
    return { ...d, [roleId]: s };
  });

  return (
    <>
      <PageHeader title="Permissions" description="What each role can do. Super Admin always has every permission. Every change is audit-logged." actions={<Button disabled={!dirty.length} loading={save.isPending} onClick={() => save.mutate()}>Save {dirty.length ? `(${dirty.length} role${dirty.length > 1 ? 's' : ''})` : ''}</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={4} /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Permission</TableHead>{roles?.map((r) => <TableHead key={r.id} className="text-center">{r.name}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {groups.map(([group, items]) => [
                <TableRow key={group} className="bg-muted/30 hover:bg-muted/30"><TableCell colSpan={(roles?.length || 0) + 1} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</TableCell></TableRow>,
                ...items.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell><div className="font-mono text-xs">{p.code}</div><div className="text-xs text-muted-foreground">{p.description}</div></TableCell>
                    {roles?.map((r) => (
                      <TableCell key={r.id} className="text-center">
                        <Checkbox
                          checked={r.code === 'SUPER_ADMIN' || draft[r.id]?.has(p.code) || false}
                          disabled={r.code === 'SUPER_ADMIN' || p.code === 'area.super_admin'}
                          onCheckedChange={() => toggle(r.id, p.code)}
                          aria-label={`${p.code} for ${r.name}`}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}

/* ---------------- Sessions ---------------- */
export function SessionsTable() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const q = { search: debounced, page, limit: 25 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['sa', 'sessions', q], queryFn: () => api(`/super-admin/sessions${toQuery(q)}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const kill = useMutation({
    mutationFn: (id) => api(`/super-admin/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Session terminated'); qc.invalidateQueries({ queryKey: ['sa', 'sessions'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const killAll = useMutation({
    mutationFn: (userId) => api(`/super-admin/users/${userId}/terminate-sessions`, { method: 'POST' }),
    onSuccess: (r) => { toast.success(`${r.revoked} session(s) terminated`); qc.invalidateQueries({ queryKey: ['sa', 'sessions'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <>
      <PageHeader title="Sessions & security" description="Active sessions across all users. Terminating a session signs that device out immediately and is audit-logged." />
      <Card className="mb-4 p-3"><div className="relative max-w-sm"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search user, email or IP" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div></Card>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={6} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No active sessions" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Device</TableHead><TableHead>IP</TableHead><TableHead>Signed in</TableHead><TableHead>Last activity</TableHead><TableHead>Method</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><div className="font-medium">{s.full_name}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                  <TableCell className="text-sm"><div>{s.device_name || '—'}</div><div className="text-xs text-muted-foreground">{s.browser} · {s.operating_system}</div></TableCell>
                  <TableCell className="font-mono text-xs">{s.ip_address || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(s.created_at)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{timeAgo(s.last_activity_at)}</TableCell>
                  <TableCell><Badge variant="outline">{s.auth_method.replace('_', ' + ').toLowerCase()}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" onClick={() => confirm(`Terminate this session for ${s.full_name}?`) && kill.mutate(s.id)}><LogOut />Terminate</Button>
                    <Button size="sm" variant="ghost" className="ml-1" onClick={() => confirm(`Terminate ALL sessions for ${s.full_name}?`) && killAll.mutate(s.user_id)}>All</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
    </>
  );
}

/* ---------------- System health ---------------- */
function HealthRow({ icon: Icon, label, ok, detail }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-muted-foreground" />{label}</span>
      <span className={cn('flex items-center gap-1.5 text-sm', ok ? 'text-emerald-700' : 'text-red-700')}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{detail}
      </span>
    </div>
  );
}

export function SystemHealth() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['sa', 'health'], queryFn: () => api('/super-admin/system-health'), refetchInterval: 30_000 });
  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) return <Card><ErrorState error={error} onRetry={refetch} /></Card>;
  return (
    <>
      <PageHeader title="System health" description={`Uptime ${Math.round(data.uptimeSeconds / 3600)}h · Node ${data.node}`} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Users" value={data.counts.users} /><StatCard label="Leads" value={Number(data.counts.leads).toLocaleString('en-IN')} />
        <StatCard label="Active sessions" value={data.counts.active_sessions} /><StatCard label="Pending requests" value={data.counts.pending_requests} tone={data.counts.pending_requests ? 'warning' : undefined} />
        <StatCard label="Failed integration events" value={data.counts.failed_events} tone={data.counts.failed_events ? 'danger' : undefined} />
      </div>
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Services</CardTitle></CardHeader>
        <CardContent className="divide-y">
          <HealthRow icon={Database} label="MySQL (Aiven)" ok={data.db.ok} detail={data.db.ok ? `${data.db.latencyMs} ms` : 'Unreachable'} />
          <HealthRow icon={Server} label="Redis / BullMQ" ok={data.redis.ok} detail={data.redis.configured ? (data.redis.ok ? 'Connected' : 'Disconnected') : 'Not configured (jobs run in-process)'} />
          <HealthRow icon={MessageSquare} label="SMS OTP provider" ok={data.otpProvider} detail={data.otpProvider ? 'Configured' : 'Not configured'} />
          <HealthRow icon={Mail} label="SMTP email" ok={data.smtp} detail={data.smtp ? 'Configured' : 'Not configured'} />
          <HealthRow icon={BellRing} label="Web push (VAPID)" ok={data.webPush} detail={data.webPush ? 'Configured' : 'Not configured'} />
        </CardContent>
      </Card>
    </>
  );
}

/* ---------------- Settings ---------------- */
const SETTING_META = {
  'auth.session_idle_minutes': { label: 'Session idle timeout (minutes)', type: 'number' },
  'auth.session_absolute_days': { label: 'Maximum session length (days)', type: 'number' },
  'auth.trusted_device_default_days': { label: 'Default trusted-device period (days)', type: 'number' },
  'auth.trusted_device_days_options': { label: 'Trusted-device options (days, comma separated)', type: 'list' },
  'auth.password_reset_ttl_minutes': { label: 'Password reset link lifetime (minutes)', type: 'number' },
  'followups.reminder_minutes_before': { label: 'Follow-up reminder (minutes before due)', type: 'number' },
  'leads.auto_assign': { label: 'Automatic lead assignment', type: 'select', options: [['NONE', 'Off: leads arrive unassigned'], ['ROUND_ROBIN_TEAM', 'Round robin within the website team']] },
};

export function SettingsForm({ canEdit }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api('/admin/settings') });
  const [draft, setDraft] = useState(null);
  useEffect(() => { if (data) setDraft(data); }, [data]);
  const m = useMutation({
    mutationFn: () => api('/super-admin/settings', { method: 'PUT', body: { settings: draft } }),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['admin', 'settings'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (isLoading || !draft) return <Skeleton className="h-64" />;
  return (
    <>
      <PageHeader title="System settings" description={canEdit ? 'Security and lead-handling defaults. Changes are audit-logged.' : 'Only a Super Admin can change these settings.'} />
      <Card className="max-w-2xl">
        <CardContent className="space-y-4 pt-5">
          {Object.entries(SETTING_META).map(([key, meta]) => (
            <Field key={key} label={meta.label}>
              {meta.type === 'select' ? (
                <Select disabled={!canEdit} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>{meta.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              ) : meta.type === 'list' ? (
                <Input disabled={!canEdit} value={(draft[key] || []).join(', ')} onChange={(e) => setDraft({ ...draft, [key]: e.target.value.split(',').map((x) => Number(x.trim())).filter(Boolean) })} />
              ) : (
                <Input disabled={!canEdit} type="number" min={1} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} />
              )}
            </Field>
          ))}
          {canEdit && <Button loading={m.isPending} onClick={() => m.mutate()}>Save settings</Button>}
        </CardContent>
      </Card>
    </>
  );
}

/* ---------------- Broadcast ---------------- */
export function BroadcastForm() {
  const { data: roles } = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api('/admin/roles') });
  const [f, setF] = useState({ title: '', body: '', roleCode: '' });
  const m = useMutation({
    mutationFn: () => api('/super-admin/notifications/broadcast', { method: 'POST', body: { title: f.title, body: f.body || null, roleCode: f.roleCode || null } }),
    onSuccess: (r) => { toast.success(`Sent to ${r.recipients} user(s)`); setF({ title: '', body: '', roleCode: '' }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <>
      <PageHeader title="Notifications" description="Send a system notification. It arrives in-app, and by push or email per each user's preferences." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>System notification</CardTitle><CardDescription>Use for maintenance windows, policy changes and similar announcements.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Audience"><Select value={f.roleCode} onChange={(e) => setF({ ...f, roleCode: e.target.value })}><option value="">All active users</option>{roles?.map((r) => <option key={r.id} value={r.code}>{r.name}s only</option>)}</Select></Field>
          <Field label="Title"><Input value={f.title} maxLength={200} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message"><Textarea value={f.body} maxLength={1000} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <Button disabled={!f.title.trim()} loading={m.isPending} onClick={() => confirm('Send this notification now?') && m.mutate()}>Send notification</Button>
        </CardContent>
      </Card>
    </>
  );
}
