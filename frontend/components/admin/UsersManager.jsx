'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Ban, CheckCircle2, LogOut, ShieldOff, ShieldCheck, Copy, Share2, Eye, EyeOff, Wand2, MessageCircle, Mail, Check } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useDebounced } from '@/lib/hooks';
import { timeAgo, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AccountStatusBadge, WebsiteBadge, Badge, RoleBadge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AvatarUploader, UserAvatar } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/controls';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { useOrg, MultiCheck } from './common';

function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#$%&*!'];
  const all = sets.join('');
  const rnd = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = sets.map((set) => set[rnd(set.length)]);
  while (chars.length < 12) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

function summaryText(d) {
  return [
    `CRM account details${d.created ? ' (new account)' : ''}`,
    `Name: ${d.name}`,
    `Email: ${d.email}`,
    `Mobile: ${d.mobile}`,
    `Role: ${d.role || '—'}`,
    `Department: ${d.department || '—'}`,
    `Website access: ${d.websites || '—'}`,
    `Teams: ${d.teams || '—'}`,
    ...(d.password ? [`Password: ${d.password}`] : []),
    `Login: ${d.loginUrl}`,
  ].join('\n');
}

function UserSummaryDialog({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  const text = summaryText(data);
  const copy = async (value = text) => {
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success('Copied to clipboard'); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error('Could not copy. Select the text and copy it manually.'); }
  };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'CRM account details', text }); } catch { /* share cancelled */ } }
    else copy();
  };
  const rows = [['Name', data.name], ['Email', data.email], ['Mobile', data.mobile], ['Role', data.role], ['Department', data.department], ['Website access', data.websites], ['Teams', data.teams], ['Login', data.loginUrl]];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <UserAvatar src={data.avatar} name={data.name} />
            <div><DialogTitle>{data.created ? 'User created' : 'User updated'}</DialogTitle><DialogDescription>Share these details with {data.name}.</DialogDescription></div>
          </div>
        </DialogHeader>
        <dl className="divide-y rounded-md border text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-2 px-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="break-all font-medium">{v || '—'}</dd></div>
          ))}
          {data.password && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-2 bg-amber-50 px-3 py-2">
              <dt className="text-amber-800">{data.created ? 'Password' : 'New password'}</dt>
              <dd className="flex items-center gap-1 font-mono font-medium">
                <span className="break-all">{show ? data.password : '•'.repeat(data.password.length)}</span>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(data.password)} aria-label="Copy password"><Copy /></Button>
              </dd>
            </div>
          )}
        </dl>
        {data.password && <p className="text-xs text-muted-foreground">The password is shown only now.{data.created ? '' : ' The user has been signed out everywhere and must sign in with the new password.'}</p>}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => copy()}>{copied ? <Check /> : <Copy />}Copy details</Button>
            <Button type="button" variant="outline" onClick={share}><Share2 />Share</Button>
            <Button type="button" variant="outline" asChild><a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a></Button>
            <Button type="button" variant="outline" asChild><a href={`mailto:${encodeURIComponent(data.email)}?subject=${encodeURIComponent('Your CRM account details')}&body=${encodeURIComponent(text)}`}><Mail />Email</a></Button>
          </div>
          <Button type="button" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserDialog({ userId, onClose, onSaved, superAdmin }) {
  const qc = useQueryClient();
  const org = useOrg();
  const { me } = useAuth();
  const editing = Boolean(userId);
  const { data: existing } = useQuery({ queryKey: ['admin', 'user', userId], queryFn: () => api(`/admin/users/${userId}`), enabled: editing });
  const [showPw, setShowPw] = useState(false);
  const [f, setF] = useState({ fullName: '', email: '', mobile: '', avatar: null, password: '', roleId: '', departmentId: '', teamIds: [], websiteIds: [] });
  useEffect(() => {
    if (existing) setF({ fullName: existing.full_name, email: existing.email, mobile: existing.mobile, avatar: existing.avatar || null, password: '', roleId: String(existing.roleIds[0] || ''), departmentId: existing.department_id ? String(existing.department_id) : '', teamIds: existing.teamIds, websiteIds: existing.websiteIds });
  }, [existing]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const myLevel = Math.max(...org.roles.filter((r) => me?.roles?.includes(r.code)).map((r) => r.level), 0);
  const iAmOwner = me?.roles?.includes('OWNER');
  const grantable = org.roles.filter((r) => (r.code === 'OWNER' ? iAmOwner : superAdmin || r.level < myLevel));

  const m = useMutation({
    mutationFn: () => {
      const body = { fullName: f.fullName, ...(editing ? {} : { email: f.email, mobile: f.mobile }), ...(editing && f.avatar !== (existing?.avatar || null) ? { avatar: f.avatar } : {}), roleId: Number(f.roleId), departmentId: f.departmentId ? Number(f.departmentId) : null, teamIds: f.teamIds, websiteIds: f.websiteIds };
      if (editing && superAdmin && f.password) body.newPassword = f.password;
      return editing ? api(`/admin/users/${userId}`, { method: 'PATCH', body }) : api('/admin/users', { method: 'POST', body: { ...body, password: f.password } });
    },
    onSuccess: () => {
      toast.success(editing ? 'User updated' : 'User created');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] }); qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
      const names = (list, ids) => list.filter((x) => ids.includes(x.id)).map((x) => x.code || x.name).join(', ');
      onSaved({
        created: !editing, name: f.fullName, email: f.email, mobile: f.mobile, avatar: f.avatar,
        role: org.roles.find((r) => String(r.id) === String(f.roleId))?.name,
        department: org.departments.find((d) => String(d.id) === String(f.departmentId))?.name,
        websites: names(org.websites, f.websiteIds), teams: names(org.teams, f.teamIds),
        password: f.password || null, loginUrl: `${window.location.origin}/login`,
      });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>{!editing && <DialogDescription>The account is active immediately. The first sign-in needs an OTP to the mobile number.</DialogDescription>}</DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          {editing && <div className="sm:col-span-2"><AvatarUploader size="h-16 w-16 text-lg" src={f.avatar} name={f.fullName} onChange={(avatar) => setF((s) => ({ ...s, avatar }))} /></div>}
          <Field label="Full name"><Input value={f.fullName} onChange={set('fullName')} required /></Field>
          <Field label="Email" hint={editing ? 'Only the user can change this, with an email code.' : undefined}><Input type="email" value={f.email} onChange={set('email')} required disabled={editing} /></Field>
          <Field label="Mobile" hint={editing ? 'Only the user can change this, with an SMS code.' : undefined}><Input type="tel" value={f.mobile} onChange={set('mobile')} required disabled={editing} /></Field>
          {(!editing || superAdmin) && (
            <Field label={editing ? 'New password' : 'Initial password'} hint={editing ? 'Leave blank to keep the current password. No old password needed.' : '10+ chars, upper, lower, number'}>
              <div className="flex gap-1">
                <Input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={f.password} onChange={set('password')} required={!editing} placeholder={editing ? 'Unchanged' : ''} />
                <Button type="button" size="icon" variant="outline" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'}>{showPw ? <EyeOff /> : <Eye />}</Button>
                <Button type="button" size="icon" variant="outline" onClick={() => { setF((s) => ({ ...s, password: generatePassword() })); setShowPw(true); }} title="Generate a strong password" aria-label="Generate password"><Wand2 /></Button>
              </div>
            </Field>
          )}
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

/** Owner-only: block an account. Blocked users are signed out everywhere, lose trusted devices, and only the Owner can unblock them. */
function BlockUserDialog({ user, onClose, onConfirm, loading }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {user.full_name}?</DialogTitle>
          <DialogDescription>
            {user.email} will be signed out of every device immediately and will not be able to sign in again.
            Their trusted devices are removed. Only the Owner can unblock this account.
          </DialogDescription>
        </DialogHeader>
        <form id="block-user" onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm(reason.trim()); }}>
          <Field label="Reason (saved in the audit log)">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required autoFocus placeholder="e.g. Left the company, suspected misuse" />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="block-user" variant="destructive" loading={loading} disabled={!reason.trim()}><ShieldOff />Block account</Button>
        </DialogFooter>
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
  const [summary, setSummary] = useState(null);
  const [blocking, setBlocking] = useState(null);
  const iAmOwner = me?.roles?.includes('OWNER');
  const q = { search: debounced, ...filters, page, limit: 25 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api(`/admin/users${toQuery(q)}`), placeholderData: keepPreviousData });

  const setStatus = useMutation({
    mutationFn: ({ id, status, reason }) => api(`/admin/users/${id}/status`, { method: 'POST', body: { status, reason } }),
    onSuccess: (_r, v) => {
      toast.success(v.status === 'BLOCKED' ? 'Account blocked and signed out everywhere' : 'Status updated');
      setBlocking(null);
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
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
          <option value="">All statuses</option>{['ACTIVE', 'PENDING_APPROVAL', 'DISABLED', 'SUSPENDED', 'BLOCKED', 'REJECTED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
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
                  <TableCell><div className="flex flex-wrap gap-1">{u.roles?.split(',').map((r) => <RoleBadge key={r} code={r} />)}</div></TableCell>
                  <TableCell><div className="flex gap-1">{u.websites?.split(',').map((c) => <WebsiteBadge key={c} code={c} />)}</div></TableCell>
                  <TableCell className="text-sm"><div>{u.department_name || '—'}</div><div className="text-xs text-muted-foreground">{u.teams}</div></TableCell>
                  <TableCell><AccountStatusBadge status={u.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</TableCell>
                  <TableCell className="text-right">
                    {u.id !== me?.user?.id && (iAmOwner || (!u.roles?.split(',').includes('OWNER') && u.status !== 'BLOCKED')) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Actions</Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {can('user.edit') && <DropdownMenuItem onClick={() => setDialog({ type: 'edit', id: u.id })}><Pencil />Edit</DropdownMenuItem>}
                          {can('user.disable') && u.status === 'ACTIVE' && <DropdownMenuItem onClick={() => confirm(`Disable ${u.full_name}? They will be signed out everywhere.`) && setStatus.mutate({ id: u.id, status: 'DISABLED' })}><Ban />Disable</DropdownMenuItem>}
                          {can('user.disable') && u.status === 'ACTIVE' && <DropdownMenuItem onClick={() => confirm(`Suspend ${u.full_name}?`) && setStatus.mutate({ id: u.id, status: 'SUSPENDED' })}><Ban />Suspend</DropdownMenuItem>}
                          {can('user.disable') && ['DISABLED', 'SUSPENDED'].includes(u.status) && <DropdownMenuItem onClick={() => setStatus.mutate({ id: u.id, status: 'ACTIVE' })}><CheckCircle2 />Re-enable</DropdownMenuItem>}
                          {can('user.block') && u.status !== 'BLOCKED' && <DropdownMenuItem className="text-destructive" onClick={() => setBlocking(u)}><ShieldOff />Block account</DropdownMenuItem>}
                          {can('user.block') && u.status === 'BLOCKED' && <DropdownMenuItem onClick={() => confirm(`Unblock ${u.full_name}? They can sign in again (with a new-device OTP).`) && setStatus.mutate({ id: u.id, status: 'ACTIVE' })}><ShieldCheck />Unblock account</DropdownMenuItem>}
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
      {dialog && <UserDialog userId={dialog.type === 'edit' ? dialog.id : null} superAdmin={superAdmin} onClose={() => setDialog(null)} onSaved={(d) => { setDialog(null); setSummary(d); }} />}
      {summary && <UserSummaryDialog data={summary} onClose={() => setSummary(null)} />}
      {blocking && <BlockUserDialog user={blocking} loading={setStatus.isPending} onClose={() => setBlocking(null)} onConfirm={(reason) => setStatus.mutate({ id: blocking.id, status: 'BLOCKED', reason })} />}
    </>
  );
}
