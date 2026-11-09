'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, X, Eye } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, toQuery } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AccountStatusBadge, WebsiteBadge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';
import { useOrg, MultiCheck } from './common';

function Detail({ label, children }) {
  return <div className="grid grid-cols-3 gap-2 py-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="col-span-2">{children || '—'}</span></div>;
}

function ApproveDialog({ req, onClose }) {
  const qc = useQueryClient();
  const org = useOrg();
  const defaultRole = org.roles.find((r) => r.code === 'NORMAL_USER');
  const [roleId, setRoleId] = useState('');
  const [departmentId, setDept] = useState(req.requested_department_id ? String(req.requested_department_id) : '');
  const [teamIds, setTeams] = useState(req.requested_team_id ? [req.requested_team_id] : []);
  const [websiteIds, setSites] = useState(req.requested_website_ids || []);
  const m = useMutation({
    mutationFn: () => api(`/super-admin/user-requests/${req.id}/approve`, { method: 'POST', body: { roleId: Number(roleId || defaultRole?.id), departmentId: departmentId ? Number(departmentId) : null, teamIds, websiteIds } }),
    onSuccess: () => { toast.success(`${req.full_name} approved`); qc.invalidateQueries({ queryKey: ['admin', 'requests'] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Approve {req.full_name}</DialogTitle><DialogDescription>Set the role and access this user starts with. You can change it later.</DialogDescription></DialogHeader>
        <Field label="Role">
          <Select value={roleId || defaultRole?.id || ''} onChange={(e) => setRoleId(e.target.value)}>
            {org.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={departmentId} onChange={(e) => setDept(e.target.value)}>
            <option value="">None</option>
            {org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Teams"><MultiCheck options={org.teams.filter((t) => !departmentId || String(t.department_id) === departmentId)} value={teamIds} onChange={setTeams} /></Field>
        <Field label="Website access"><MultiCheck options={org.websites} value={websiteIds} onChange={setSites} render={(w) => <><WebsiteBadge code={w.code} /> {w.name}</>} /></Field>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!websiteIds.length} onClick={() => m.mutate()}><Check />Approve</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ req, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const m = useMutation({
    mutationFn: () => api(`/super-admin/user-requests/${req.id}/reject`, { method: 'POST', body: { reason: reason || null } }),
    onSuccess: () => { toast.success('Request rejected'); qc.invalidateQueries({ queryKey: ['admin', 'requests'] }); onClose(); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reject {req.full_name}?</DialogTitle><DialogDescription>They won&apos;t be able to sign in. The reason is included in the email they receive.</DialogDescription></DialogHeader>
        <Field label="Reason (optional)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" loading={m.isPending} onClick={() => m.mutate()}>Reject request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserRequests({ canReview }) {
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState(null);
  const q = { status: status === 'ALL' ? '' : status, page, limit: 25 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'requests', q], queryFn: () => api(`/admin/user-requests${toQuery(q)}`), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="User requests" description={canReview ? 'Review and approve new account requests.' : 'Account requests are approved by a Super Admin.'} />
      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} className="mb-4">
        <TabsList><TabsTrigger value="PENDING_APPROVAL">Pending</TabsTrigger><TabsTrigger value="APPROVED">Approved</TabsTrigger><TabsTrigger value="REJECTED">Rejected</TabsTrigger><TabsTrigger value="ALL">All</TabsTrigger></TabsList>
      </Tabs>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={6} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No requests" description="New account requests appear here." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Requested department / team</TableHead><TableHead>Websites</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><div className="font-medium">{r.full_name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                  <TableCell className="text-sm">{r.mobile}</TableCell>
                  <TableCell className="text-sm">{[r.requested_department, r.requested_team].filter(Boolean).join(' / ') || '—'}</TableCell>
                  <TableCell><div className="flex gap-1">{r.requested_websites.map((c) => <WebsiteBadge key={c} code={c} />)}</div></TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell><AccountStatusBadge status={r.status} /></TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" onClick={() => setAction({ type: 'view', req: r })} aria-label="View details"><Eye /></Button>
                    {canReview && r.status === 'PENDING_APPROVAL' && <>
                      <Button size="sm" variant="outline" className="ml-1" onClick={() => setAction({ type: 'reject', req: r })}><X />Reject</Button>
                      <Button size="sm" className="ml-1" onClick={() => setAction({ type: 'approve', req: r })}><Check />Approve</Button>
                    </>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination meta={data?.meta} onPage={setPage} />
      </Card>
      {action?.type === 'approve' && <ApproveDialog req={action.req} onClose={() => setAction(null)} />}
      {action?.type === 'reject' && <RejectDialog req={action.req} onClose={() => setAction(null)} />}
      {action?.type === 'view' && (
        <Dialog open onOpenChange={(o) => !o && setAction(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>{action.req.full_name}</DialogTitle></DialogHeader>
            <div className="divide-y">
              <Detail label="Email">{action.req.email}</Detail>
              <Detail label="Mobile">{action.req.mobile}</Detail>
              <Detail label="Department">{action.req.requested_department}</Detail>
              <Detail label="Team">{action.req.requested_team}</Detail>
              <Detail label="Websites">{action.req.requested_websites.join(', ')}</Detail>
              <Detail label="Notes">{action.req.notes}</Detail>
              <Detail label="Requested">{formatDateTime(action.req.created_at)}</Detail>
              <Detail label="Status"><AccountStatusBadge status={action.req.status} /></Detail>
              {action.req.reviewer_name && <Detail label="Reviewed by">{action.req.reviewer_name} · {formatDateTime(action.req.reviewed_at)}</Detail>}
              {action.req.rejection_reason && <Detail label="Reason">{action.req.rejection_reason}</Detail>}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
