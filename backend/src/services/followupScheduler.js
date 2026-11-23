import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { settingsService } from './settingsService.js';
import { notificationService } from '../notifications/notificationService.js';
import { emitToUser, EVENTS } from '../realtime/socket.js';

/** Sends "due soon" reminders and marks overdue follow-ups. Runs every minute (BullMQ repeatable job or interval). */
export async function runFollowupSweep() {
  const minutes = await settingsService.get('followups.reminder_minutes_before');

  const due = await query(
    `SELECT f.id, f.user_id, f.lead_id, f.due_at, l.name FROM lead_followups f JOIN leads l ON l.id = f.lead_id
     WHERE f.status = 'UPCOMING' AND f.reminder_sent_at IS NULL AND f.due_at <= NOW(3) + INTERVAL ? MINUTE AND f.due_at > NOW(3) LIMIT 500`, [minutes],
  );
  for (const f of due) {
    const claimed = await query('UPDATE lead_followups SET reminder_sent_at = NOW(3) WHERE id = ? AND reminder_sent_at IS NULL', [f.id]);
    if (!claimed.affectedRows) continue;
    const mins = Math.max(1, Math.round((new Date(f.due_at).getTime() - Date.now()) / 60_000));
    await notificationService.notify(f.user_id, {
      type: 'FOLLOWUP_DUE', title: `Follow-up due in ${mins} min`, body: f.name || 'Lead follow-up', link: `/crm/leads/${f.lead_id}`, data: { followupId: f.id },
    });
  }

  const overdue = await query(
    `SELECT f.id, f.user_id, f.lead_id, l.name FROM lead_followups f JOIN leads l ON l.id = f.lead_id
     WHERE f.status = 'UPCOMING' AND f.due_at < NOW(3) LIMIT 500`,
  );
  for (const f of overdue) {
    const claimed = await query("UPDATE lead_followups SET status = 'OVERDUE', overdue_notified_at = NOW(3) WHERE id = ? AND status = 'UPCOMING'", [f.id]);
    if (!claimed.affectedRows) continue;
    emitToUser(f.user_id, EVENTS.FOLLOWUP_UPDATED, { id: f.id, leadId: f.lead_id, status: 'OVERDUE' });
    await notificationService.notify(f.user_id, {
      type: 'FOLLOWUP_OVERDUE', title: 'Follow-up overdue', body: f.name || 'Lead follow-up', link: `/crm/leads/${f.lead_id}`, data: { followupId: f.id },
    });
  }
  // Assignments not acknowledged 10 minutes after someone assigned them: remind the assignee (popup) and tell the assigner.
  const unacked = await query(
    `SELECT la.id, la.lead_id, la.assigned_user_id, la.assigned_by, la.reason, l.name, l.external_lead_id, au.full_name AS assignee, bu.full_name AS assigner
     FROM lead_assignments la JOIN leads l ON l.id = la.lead_id AND l.assigned_user_id = la.assigned_user_id
     LEFT JOIN users au ON au.id = la.assigned_user_id LEFT JOIN users bu ON bu.id = la.assigned_by
     WHERE la.acknowledged_at IS NULL AND la.reminded_at IS NULL AND la.assigned_by IS NOT NULL AND la.assigned_by <> la.assigned_user_id
       AND la.created_at <= NOW(3) - INTERVAL 10 MINUTE AND la.created_at > NOW(3) - INTERVAL 1 DAY LIMIT 200`,
  );
  for (const a of unacked) {
    const claimed = await query('UPDATE lead_assignments SET reminded_at = NOW(3) WHERE id = ? AND reminded_at IS NULL', [a.id]);
    if (!claimed.affectedRows) continue;
    const remark = a.reason && a.reason !== 'bulk' ? a.reason : null;
    const label = `${a.name || 'Unnamed'} · ${a.external_lead_id}`;
    emitToUser(a.assigned_user_id, EVENTS.ASSIGNMENT_REMINDER, { leadId: a.lead_id, name: a.name, externalLeadId: a.external_lead_id, remark, by: a.assigner });
    await notificationService.notify(a.assigned_user_id, {
      type: 'ASSIGNMENT_REMINDER', title: 'Reminder: please acknowledge your assigned lead',
      body: `${label}${remark ? `\nRemark: ${remark}` : ''}`, link: `/crm/leads/${a.lead_id}`, data: { leadId: a.lead_id, needsAck: true },
    });
    await notificationService.notify(a.assigned_by, {
      type: 'ASSIGNMENT_REMINDER', title: `${a.assignee || 'Assignee'} hasn't acknowledged a lead yet`,
      body: `${label} · assigned over 10 min ago. A reminder was sent to them.`, link: `/crm/leads/${a.lead_id}`, data: { leadId: a.lead_id },
    });
  }
  if (due.length || overdue.length || unacked.length) logger.info({ reminders: due.length, overdue: overdue.length, ackReminders: unacked.length }, 'Follow-up sweep');
}
