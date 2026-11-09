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
  if (due.length || overdue.length) logger.info({ reminders: due.length, overdue: overdue.length }, 'Follow-up sweep');
}
