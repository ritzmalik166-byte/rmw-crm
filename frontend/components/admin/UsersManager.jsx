'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Ban, CheckCircle2, LogOut } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced } from '@/lib/hooks';
import { timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AccountStatusBadge, WebsiteBadge, Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AvatarUploader, UserAvatar } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/controls';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { useOrg, MultiCheck } from './common';

function UserDialog({ userId, onClose, superAdmin }) {
  const qc = useQueryClient();
  const org = useOrg();
  const { me } = useAuth();
  const editing = Boolean(userId);
  const { data: existing } = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => api(`/admin/users/${userId}`), enabled: editing });
  const [f, setF] = useState({ fullName: '', email: '', mobile: '', avatar: null, password: '', roleId: '', departmentId: '', teamIds: [], websiteIds: [] });
  useEffect(() => {
    if (existing) setF({ fullName: existing.full_name, email: existing.email, mobile: existing.mobile, avatar: existing.avatar || null, password: '', roleId: String(existing.roleIds[0] || ''), departmentId: existing.department_id ? String(existing.department_id) : '', teamIds: existing.teamIds, websiteIds: existing.websiteIds });
  }, [existing]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  // Only offer roles below the caller's own level; the API enforces the same rule.
  const myLevel = Math.max(...org.roles.filter((r) => me?.roles?.includes(r.code)).map((r) => r.level), 0);
  const grantable = org.roles.filter((r) => superAdmin || r.level < myLevel);

  const m = useMutation({
    mutationFn: () => {
      const body = { fullName: f.fullName, email: f.email, mobile: f.mobile, ...(editing && f.avatar !== (existing?.avatar || null) ? { avatar: f.avatar } : {}), roleId: Number(f.roleId), departmentId: f.departmentId ? Number(f.departmentId) : null, teamIds: f.teamIds, websiteIds: f.websiteIds };
      return editing ? api(`/admin/users/${userId}`, { method: 'PATCH', body }) : api('/admin/users', { method: 'POST', body: { ...body, password: f.password } });
    },
    onSuccess: () => { toast.success(editing ? 'User updated' : 'User created'); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); qc.invalidateQueries({ queryKey: ['admin', 'user', userId] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>{!editing && <DialogDescription>The account is active immediately. The first sign-in needs an OTP to the mobile number.</DialogDescription>}</DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {editing && <div className="sm:col-span-2"><AvatarUploader size="h-16 w-16 text-lg" src={f.avatar} name={f.fullName} onChange={(avatar) => setF((s) => ({ ...s, avatar }))} /></div>}
          <Field label="Full name"><Input value={f.fullName} onChange={set('fullName')} required /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} required /></Field>
          <Field label="Mobile" hint={editing ? 'Changing it here skips OTP verification.' : undefined}><Input type="tel" value={f.mobile} onChange={set('mobile')} required /></Field>
          {!editing && <Field label="Initial password" hint="10+ chars, upper, lower, number"><Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required /></Field>}
          <Field label="Role">
            <Select value={f.roleId} onChange={set('roleId')} required>
              <option value="">Select…</option>
              {grantable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={f.departmentId} onChange={set('departmentId')}>
              <option value="">None</option>
              {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Website access" className="sm:col-span-2"><MultiCheck options={org.websites} value={f.websiteIds} onChange={(v) => setF((s) => ({ ...s, websiteIds: v }))} render={(w) => <><WebsiteBadge code={w.code} /> {w.name}</>} /></Field>
          <Field label="Teams" className="sm:col-span-2"><MultiCheck options={org.teams} value={f.teamIds} onChange={(v) => setF((s) => ({ ...s, teamIds: v }))} /></Field>
          <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" loading={m.isPending}>{editing ? 'Save changes' : 'Create user'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManager({ superAdmin = false }) {
  const qc = useQueryClient();
  const { can, me } = useAuth();
  const org = useOrg();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [filters, setFilters] = useState({ status: '', roleCode: '', websiteId: '' });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const q = { search: debounced, ...filters, page, limit: 25 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api(`/admin/users${toQuery(q)}`), placeholderData: keepPreviousData });

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => api(`/admin/users/${id}/status`, { method: 'POST', body: { status } }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['admin', 'users'] }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const killSessions = useMutation({
    mutationFn: (id) => api(`/super-admin/users/${id}/terminate-sessions`, { method: 'POST' }),
    onSuccess: (r) => toast.success(`${r.revoked} session(s) terminated`),
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader title={superAdmin ? 'Users & admins' : 'Users'} description="Manage accounts, roles and website access." actions={can('user.create') && <Button onClick={() => setDialog({ type: 'create' })}><Plus />Create user</Button>} />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-4">
        <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search name, email, mobile" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></div>
        <Select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} aria-label="Status">
          <option value="">All statuses</option>{['ACTIVE', 'PENDING_APPROVAL', 'DISABLED', 'SUSPENDED', 'REJECTED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </Select>
        <Select value={filters.roleCode} onChange={(e) => { setFilters({ ...filters, roleCode: e.target.value }); setPage(1); }} aria-label="Role">
          <option value="">All roles</option>{org.roles.map((r) => <option key={r.id} value={r.code}>{r.name}</option>)}
        </Select>
        <Select value={filters.websiteId} onChange={(e) => { setFilters({ ...filters, websiteId: e.target.value }); setPage(1); }} aria-label="Website">
          <option value="">All websites</option>{org.websites.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}
        </Select>
      </Card>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={6} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No users found" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Websites</TableHead><TableHead>Department / teams</TableHead><TableHead>Status</TableHead><TableHead>Last login</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell><div className="flex items-center gap-2.5"><UserAvatar src={u.avatar} name={u.full_name} /><div className="min-w-0"><div className="font-medium">{u.full_name}{u.id === me?.user?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div><div className="text-xs text-muted-foreground">{u.email} · {u.mobile}</div></div></div></TableCell>
                  <TableCell>{u.roles?.split(',').map((r) => <Badge key={r} variant={r === 'SUPER_ADMIN' ? 'default' : r === 'ADMIN' ? 'info' : 'secondary'} className="mr-1">{r.replace('_', ' ').toLowerCase()}</Badge>)}</TableCell>
                  <TableCell><div className="flex gap-1">{u.websites?.split(',').map((c) => <WebsiteBadge key={c} code={c} />)}</div></TableCell>
                  <TableCell className="text-sm"><div>{u.department_name || '—'}</div><div className="text-xs text-muted-foreground">{u.teams}</div></TableCell>
                  <TableCell><AccountStatusBadge status={u.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</TableCell>
                  <TableCell className="text-right">
                    {u.id !== me?.user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Actions</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {can('user.edit') && <DropdownMenuItem onClick={() => setDialog({ type: 'edit', id: u.id })}><Pencil />Edit</DropdownMenuItem>}
                          {can('user.disable') && u.status === 'ACTIVE' && <DropdownMenuItem onClick={() => confirm(`Disable ${u.full_name}? They will be signed out everywhere.`) && setStatus.mutate({ id: u.id, status: 'DISABLED' })}><Ban />Disable</DropdownMenuItem>}
                          {can('user.disable') && u.status === 'ACTIVE' && <DropdownMenuItem onClick={() => confirm(`Suspend ${u.full_name}?`) && setStatus.mutate({ id: u.id, status: 'SUSPENDED' })}><Ban />Suspend</DropdownMenuItem>}
                          {can('user.disable') && ['DISABLED', 'SUSPENDED'].includes(u.status) && <DropdownMenuItem onClick={() => setStatus.mutate({ id: u.id, status: 'ACTIVE' })}><CheckCircle2 />Re-enable</DropdownMenuItem>}
                          {superAdmin && can('session.revoke_any') && <DropdownMenuItem onClick={() => confirm(`Terminate all sessions for ${u.full_name}?`) && killSessions.mutate(u.id)}><LogOut />Terminate all sessions</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
      {dialog && <UserDialog userId={dialog.type === 'edit' ? dialog.id : null} superAdmin={superAdmin} onClose={() => setDialog(null)} />}
    </>
  );
}
