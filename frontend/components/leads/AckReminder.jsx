'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, ExternalLink } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export const ackLead = (leadId) => api(`/crm/leads/${leadId}/acknowledge`, { method: 'POST' });

/**
 * Reminder popup for assignments the signed-in user hasn't acknowledged.
 * Opens on the live ASSIGNMENT_REMINDER event (sent 10 minutes after assigning) and, on load, for any
 * reminder that was already sent while this user was away.
 */
export function AckReminder() {
  const router = useRouter();
  const qc = useQueryClient();
  const [queue, setQueue] = useState([]);
  const { data: pending } = useQuery({ queryKey: ['assignments', 'pending'], queryFn: () => api('/crm/assignments/pending'), staleTime: 60_000 });

  useEffect(() => {
    const missed = (pending || []).filter((p) => p.reminded_at)
      .map((p) => ({ leadId: p.lead_id, name: p.name, externalLeadId: p.external_lead_id, remark: p.remark && p.remark !== 'bulk' ? p.remark : null, by: p.assigned_by_name }));
    if (missed.length) setQueue((q) => [...q, ...missed.filter((m) => !q.some((x) => x.leadId === m.leadId))]);
  }, [pending]);

  useEffect(() => {
    const on = (e) => setQueue((q) => (q.some((x) => x.leadId === e.detail.leadId) ? q : [...q, e.detail]));
    window.addEventListener('crm:ack-reminder', on);
    return () => window.removeEventListener('crm:ack-reminder', on);
  }, []);

  const current = queue[0];
  const next = () => setQueue((q) => q.slice(1));
  const ack = useMutation({
    mutationFn: () => ackLead(current.leadId),
    onSuccess: () => {
      toast.success('Acknowledged');
      qc.invalidateQueries({ queryKey: ['lead', String(current.leadId)] });
      qc.invalidateQueries({ queryKey: ['assignments', 'pending'] });
      next();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <Dialog open={Boolean(current)} onOpenChange={(o) => { if (!o) next(); }}>
      {current && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-amber-500" />{current.fresh ? (current.reassigned ? 'A lead was transferred to you' : 'New lead assigned to you') : 'Please acknowledge this lead'}</DialogTitle>
            <DialogDescription>
              {current.by ? <><b>{current.by}</b> assigned</> : 'You were assigned'} <b>{current.name || 'a lead'}</b>{current.externalLeadId ? ` (${current.externalLeadId})` : ''} to you{current.fresh ? '. Please acknowledge it so they know you have it.' : ' and is waiting for your confirmation.'}
            </DialogDescription>
          </DialogHeader>
          {current.remark && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Remark</p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{current.remark}</p>
            </div>
          )}
          {queue.length > 1 && <p className="text-[12px] text-slate-500">{queue.length - 1} more waiting after this one.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { router.push(`/crm/leads/${current.leadId}`); next(); }}><ExternalLink />Open lead</Button>
            <Button loading={ack.isPending} onClick={() => ack.mutate()}><CheckCircle2 />Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
