'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, CheckCircle2, Clock } from 'lucide-react';
import { apiMessage } from '@/lib/api';
import { timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ackLead } from '@/components/leads/AckReminder';

/**
 * Latest manual assignment on a lead: the remark, and whether the assignee has acknowledged it.
 * The assignee gets an Acknowledge button; everyone else sees "waiting" / "acknowledged".
 */
export function AssignmentBanner({ lead, userId }) {
  const qc = useQueryClient();
  const a = lead.assignments?.[0];
  const ack = useMutation({
    mutationFn: () => ackLead(lead.id),
    onSuccess: () => {
      toast.success('Acknowledged');
      qc.invalidateQueries({ queryKey: ['lead', String(lead.id)] });
      qc.invalidateQueries({ queryKey: ['assignments', 'pending'] });
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  // Only manual assignments by someone else to the current owner need acknowledging.
  if (!a || !a.assigned_user_id || a.assigned_user_id !== lead.assigned_user_id || !a.assigned_by || a.assigned_by === a.assigned_user_id) return null;
  const remark = a.reason && a.reason !== 'bulk' ? a.reason : null;
  const mine = a.assigned_user_id === userId;
  const done = Boolean(a.acknowledged_at);

  return (
    <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${done ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/70'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {done ? <CheckCircle2 className="h-5 w-5" /> : mine ? <BellRing className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1 text-[13px] text-slate-800">
        <p className="font-medium">
          {done
            ? <>{mine ? 'You' : a.assigned_to} acknowledged this lead {timeAgo(a.acknowledged_at)}.</>
            : mine
              ? <><b>{a.assigned_by_name || 'Someone'}</b> assigned this lead to you {timeAgo(a.created_at)}. Please acknowledge it.</>
              : <>Waiting for <b>{a.assigned_to}</b> to acknowledge (assigned {timeAgo(a.created_at)} by {a.assigned_by_name || 'someone'}).{a.reminded_at ? ' Reminder sent.' : ''}</>}
        </p>
        {remark && <p className="mt-1 whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]"><span className="font-semibold text-slate-500">Remark: </span>{remark}</p>}
      </div>
      {mine && !done && (
        <Button size="sm" className="shrink-0 max-sm:w-full" loading={ack.isPending} onClick={() => ack.mutate()}><CheckCircle2 />Acknowledge</Button>
      )}
    </div>
  );
}
