'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { STATUS_COLORS, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, StatusBadge, WebsiteBadge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Skeleton, TableSkeleton } from '@/components/ui/feedback';
import { useOrg, MultiCheck } from './common';

function useSave(key, okMsg) {
  const qc = useQueryClient();
  return (fn, after) => ({
    mutationFn: fn,
    onSuccess: () => { toast.success(okMsg); qc.invalidateQueries({ queryKey: key }); after?.(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
}

/* ---------------- Departments ---------------- */
export function DepartmentsManager() {
  const { can } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'departments'], queryFn: () => api('/admin/departments') });
  const [edit, setEdit] = useState(null);
  const save = useSave(['admin', 'departments'], 'Saved');
  const m = useMutation(save((d) => (d.id ? api(`/admin/departments/${d.id}`, { method: 'PATCH', body: { name: d.name, description: d.description || null } }) : api('/admin/departments', { method: 'POST', body: { name: d.name, description: d.description || null } })), () => setEdit(null)));
  const del = useMutation(save((id) => api(`/admin/departments/${id}`, { method: 'DELETE' })));
  const manage = can('department.manage');

  return (
    <>
      <PageHeader title="Departments" description="Departments group teams, e.g. Marketing → MPF Marketing." actions={manage && <Button onClick={() => setEdit({ name: '', description: '' })}><Plus />Add department</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={4} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.length ? <EmptyState title="No departments" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Teams</TableHead><TableHead>Users</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.description || '—'}</TableCell>
                  <TableCell>{d.team_count}</TableCell><TableCell>{d.user_count}</TableCell>
                  <TableCell className="text-right">{manage && <>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(d)} aria-label="Edit"><Pencil /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${d.name}?`) && del.mutate(d.id)} aria-label="Delete"><Trash2 /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? 'Edit department' : 'Add department'}</DialogTitle></DialogHeader>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><Input value={edit.description || ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(edit)}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ---------------- Teams ---------------- */
function MembersDialog({ team, onClose }) {
  const { data: members } = useQuery({ queryKey: ['admin', 'team-members', team.id], queryFn: () => api(`/admin/teams/${team.id}/members`) });
  const { data: users } = useQuery({ queryKey: ['admin', 'users', 'all-active'], queryFn: () => api(`/admin/users${toQuery({ status: 'ACTIVE', limit: 100 })}`) });
  const [ids, setIds] = useState([]);
  const [leads, setLeads] = useState([]);
  useEffect(() => { if (members) { setIds(members.map((m) => m.id)); setLeads(members.filter((m) => m.is_lead).map((m) => m.id)); } }, [members]);
  const m = useMutation(useSave(['admin', 'teams'], 'Members updated')(() => api(`/admin/teams/${team.id}/members`, { method: 'PUT', body: { members: ids.map((userId) => ({ userId, isLead: leads.includes(userId) })) } }), onClose));
  const options = (users?.rows || []).map((u) => ({ id: u.id, name: u.full_name, avatar: u.avatar || null }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{team.name} members</DialogTitle></DialogHeader>
        {(!users || !members) ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading people">
            <Skeleton className="h-4 w-20" />
            <div className="flex flex-wrap gap-x-4 gap-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-4 w-4 rounded-sm" /><Skeleton className="h-6 w-6 rounded-full" /><Skeleton className="h-4 w-20" /></div>)}</div>
            <Skeleton className="h-4 w-24" />
            <div className="flex gap-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="flex items-center gap-2"><Skeleton className="h-4 w-4 rounded-sm" /><Skeleton className="h-6 w-6 rounded-full" /><Skeleton className="h-4 w-20" /></div>)}</div>
          </div>
        ) : <>
        <Field label="Members"><MultiCheck options={options} value={ids} onChange={setIds} title={`${team.name}: members`} /></Field>
        {ids.length > 0 && <Field label="Team leads"><MultiCheck options={options.filter((o) => ids.includes(o.id))} value={leads} onChange={setLeads} title={`${team.name}: team leads`} /></Field>}
        </>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!users || !members} onClick={() => m.mutate()}>Save members</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamsManager() {
  const { can } = useAuth();
  const org = useOrg();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams') });
  const [edit, setEdit] = useState(null);
  const [members, setMembers] = useState(null);
  const save = useSave(['admin', 'teams'], 'Saved');
  const m = useMutation(save((t) => {
    const body = { name: t.name, departmentId: Number(t.department_id), websiteId: t.website_id ? Number(t.website_id) : null, description: t.description || null };
    return t.id ? api(`/admin/teams/${t.id}`, { method: 'PATCH', body }) : api('/admin/teams', { method: 'POST', body });
  }, () => setEdit(null)));
  const del = useMutation(save((id) => api(`/admin/teams/${id}`, { method: 'DELETE' })));
  const manage = can('team.manage');

  return (
    <>
      <PageHeader title="Teams" description="Teams belong to a department and can be linked to a website for round-robin assignment." actions={manage && <Button onClick={() => setEdit({ name: '', department_id: org.departments[0]?.id || '', website_id: '' })}><Plus />Add team</Button>} />
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={5} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.length ? <EmptyState title="No teams" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Team</TableHead><TableHead>Department</TableHead><TableHead>Website</TableHead><TableHead>Members</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm">{t.department_name}</TableCell>
                  <TableCell>{t.website_code ? <WebsiteBadge code={t.website_code} /> : '—'}</TableCell>
                  <TableCell>{t.member_count}</TableCell>
                  <TableCell><Badge variant={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap text-right">{manage && <>
                    <Button size="sm" variant="outline" onClick={() => setMembers(t)}><Users />Members</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(t)} aria-label="Edit"><Pencil /></Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${t.name}?`) && del.mutate(t.id)} aria-label="Delete"><Trash2 /></Button>
                  </>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? 'Edit team' : 'Add team'}</DialogTitle></DialogHeader>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Department"><Select value={edit.department_id} onChange={(e) => setEdit({ ...edit, department_id: e.target.value })}>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Website"><Select value={edit.website_id || ''} onChange={(e) => setEdit({ ...edit, website_id: e.target.value })}><option value="">None</option>{org.websites.map((w) => <option key={w.id} value={w.id}>{w.code}</option>)}</Select></Field>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(edit)}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {members && <MembersDialog team={members} onClose={() => setMembers(null)} />}
    </>
  );
}

/* ---------------- Websites ---------------- */
export function WebsitesManager({ canEdit = false }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites') });
  const [edit, setEdit] = useState(null);
  const m = useMutation(useSave(['admin', 'websites'], 'Website updated')((w) => api(`/super-admin/websites/${w.id}`, { method: 'PATCH', body: { name: w.name, domain: w.domain, isActive: !!w.is_active } }), () => setEdit(null)));
  return (
    <>
      <PageHeader title="Websites" description="Source websites feeding leads into the CRM. External lead IDs use the prefix shown." />
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={5} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Website</TableHead><TableHead>Domain</TableHead><TableHead>ID prefix</TableHead><TableHead>Leads</TableHead><TableHead>Users</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.map((w) => (
                <TableRow key={w.id}>
                  <TableCell><WebsiteBadge code={w.code} /> <span className="ml-1 font-medium">{w.name}</span></TableCell>
                  <TableCell className="text-sm">{w.domain}</TableCell>
                  <TableCell className="font-mono text-xs">{w.external_id_prefix}-</TableCell>
                  <TableCell className="tabular-nums">{Number(w.lead_count).toLocaleString('en-IN')}</TableCell>
                  <TableCell>{w.user_count}</TableCell>
                  <TableCell><Badge variant={w.is_active ? 'success' : 'secondary'}>{w.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="text-right">{canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(w)} aria-label="Edit"><Pencil /></Button>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit {edit.code}</DialogTitle></DialogHeader>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Domain"><Input value={edit.domain || ''} onChange={(e) => setEdit({ ...edit, domain: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} />Active (inactive websites reject new leads)</label>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(edit)}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ---------------- Lead statuses & sources ---------------- */
export function LeadConfigManager() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: lk, isLoading } = useQuery({ queryKey: ['lookups'], queryFn: () => api('/crm/lookups') });
  const [edit, setEdit] = useState(null);
  const manage = can('lead_config.manage');
  const m = useMutation({
    mutationFn: (s) => {
      const body = { name: s.name, color: s.color, sortOrder: Number(s.sort_order), isConversion: !!s.is_conversion, isClosed: !!s.is_closed };
      return s.id ? api(`/admin/lead-statuses/${s.id}`, { method: 'PATCH', body: { ...body, isActive: !!s.is_active, isDefault: !!s.is_default } }) : api('/admin/lead-statuses', { method: 'POST', body: { ...body, code: s.code } });
    },
    onSuccess: () => { toast.success('Status saved'); qc.invalidateQueries({ queryKey: ['lookups'] }); setEdit(null); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <>
      <PageHeader title="Lead configuration" description="Lead statuses used across all websites, and the lead sources detected so far." actions={manage && <Button onClick={() => setEdit({ code: '', name: '', color: 'slate', sort_order: 100, is_active: 1 })}><Plus />Add status</Button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader><CardTitle>Statuses</CardTitle></CardHeader>
          {isLoading ? <TableSkeleton cols={4} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Code</TableHead><TableHead>Order</TableHead><TableHead>Flags</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {lk?.statuses?.map((s) => (
                  <TableRow key={s.id} className={s.is_active ? '' : 'opacity-50'}>
                    <TableCell><StatusBadge name={s.name} color={s.color} /></TableCell>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>{s.sort_order}</TableCell>
                    <TableCell className="space-x-1">{!!s.is_default && <Badge variant="info">Default</Badge>}{!!s.is_conversion && <Badge variant="success">Conversion</Badge>}{!!s.is_closed && <Badge>Closed</Badge>}{!s.is_active && <Badge variant="secondary">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">{manage && <Button size="sm" variant="ghost" onClick={() => setEdit(s)} aria-label="Edit"><Pencil /></Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader><CardTitle>Lead sources</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">Created automatically from UTM source, click IDs and referrers.</p>
            <div className="flex flex-wrap gap-1.5">{lk?.sources?.length ? lk.sources.map((s) => <Badge key={s.id} variant="outline">{s.name}</Badge>) : <span className="text-sm text-muted-foreground">No sources yet</span>}</div>
          </CardContent>
        </Card>
      </div>
      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{edit.id ? `Edit ${edit.name}` : 'Add status'}</DialogTitle></DialogHeader>
            {!edit.id && <Field label="Code" hint="UPPER_SNAKE_CASE, cannot be changed later"><Input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>}
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Colour"><Select value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })}>{Object.keys(STATUS_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
              <Field label="Order"><Input type="number" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: e.target.value })} /></Field>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!edit.is_conversion} onCheckedChange={(v) => setEdit({ ...edit, is_conversion: v })} />Counts as a conversion</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={!!edit.is_closed} onCheckedChange={(v) => setEdit({ ...edit, is_closed: v })} />Closed (not an open lead)</label>
              {edit.id && <label className="flex items-center gap-2 text-sm"><Switch checked={!!edit.is_default} onCheckedChange={(v) => setEdit({ ...edit, is_default: v })} />Default for new leads</label>}
              {edit.id && <label className="flex items-center gap-2 text-sm"><Switch checked={!!edit.is_active} onCheckedChange={(v) => setEdit({ ...edit, is_active: v })} />Active</label>}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate(edit)}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
