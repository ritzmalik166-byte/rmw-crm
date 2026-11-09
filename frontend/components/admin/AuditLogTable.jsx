'use client';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime, toQuery } from '@/lib/utils';
import { Input, Select } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, PageHeader, Pagination, TableSkeleton } from '@/components/ui/feedback';

const ACTIONS = ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'OTP_REQUESTED', 'OTP_VERIFIED', 'OTP_FAILED', 'NEW_DEVICE_DETECTED', 'DEVICE_TRUSTED', 'DEVICE_REVOKED',
  'SESSION_CREATED', 'SESSION_REVOKED', 'LOGOUT', 'LOGOUT_ALL_DEVICES', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_REQUESTED', 'ACCOUNT_APPROVED',
  'ACCOUNT_REJECTED', 'ACCOUNT_DISABLED', 'ACCOUNT_ENABLED', 'USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'PERMISSION_CHANGED', 'LEAD_CREATED',
  'LEAD_ASSIGNED', 'LEAD_REASSIGNED', 'LEAD_UPDATED', 'LEAD_STATUS_CHANGED', 'LEAD_MERGED', 'LEAD_EXPORTED', 'LEAD_DELETED', 'INTEGRATION_CHANGED', 'SETTINGS_CHANGED'];

const tone = (a) => (/FAILED|REJECTED|DISABLED|REVOKED|DELETED/.test(a) ? 'danger' : /LOGIN_SUCCESS|APPROVED|VERIFIED|CREATED/.test(a) ? 'success' : /DEVICE|OTP|SESSION|PASSWORD/.test(a) ? 'info' : 'secondary');

export function AuditLogTable() {
  const [f, setF] = useState({ action: '', entityType: '', from: '', to: '', page: 1 });
  const q = { ...f, limit: 50 };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['admin', 'audit', q], queryFn: () => api(`/admin/audit-logs${toQuery(q)}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Audit logs" description="Authentication, administration and lead-management events. Passwords and OTPs are never recorded." />
      <Card className="mb-4 grid gap-2 p-3 sm:grid-cols-4">
        <Select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value, page: 1 })} aria-label="Action"><option value="">All actions</option>{ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
        <Select value={f.entityType} onChange={(e) => setF({ ...f, entityType: e.target.value, page: 1 })} aria-label="Entity"><option value="">All entities</option>{['user', 'lead', 'session', 'device', 'role', 'website', 'team', 'department', 'settings', 'registration_request'].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
        <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, page: 1 })} aria-label="From" />
        <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value ? `${e.target.value}T23:59:59` : '', page: 1 })} aria-label="To" />
      </Card>
      <Card className="overflow-hidden">
        {isLoading ? <TableSkeleton cols={6} /> : isError ? <ErrorState error={error} onRetry={refetch} /> : !data.rows.length ? <EmptyState title="No events" /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Entity</TableHead><TableHead>IP</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.map((r) => {
                const meta = typeof r.meta === 'string' ? JSON.parse(r.meta) : r.meta;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell><Badge variant={tone(r.action)}>{r.action}</Badge></TableCell>
                    <TableCell className="text-sm">{r.actor_name ? <><div>{r.actor_name}</div><div className="text-xs text-muted-foreground">{r.actor_email}</div></> : <span className="text-muted-foreground">System</span>}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{r.entity_type ? `${r.entity_type} #${r.entity_id}` : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{r.ip_address || '—'}</TableCell>
                    <TableCell className="max-w-sm truncate font-mono text-xs text-muted-foreground" title={meta ? JSON.stringify(meta, null, 2) : ''}>{meta ? JSON.stringify(meta) : ''}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination meta={data?.meta} onPage={(page) => setF({ ...f, page })} />
      </Card>
    </>
  );
}
