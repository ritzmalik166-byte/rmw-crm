import { one } from '../config/db.js';
import { processIntegrationEvent } from '../services/leadIngestService.js';
import { emailService } from '../notifications/emailService.js';
import { pushService } from '../notifications/pushService.js';
import { runFollowupSweep } from '../services/followupScheduler.js';

export async function processJob(queueName, jobName, data) {
  switch (queueName) {
    case 'lead-sync':
      return processIntegrationEvent(data.eventId);
    case 'email': {
      if (jobName === 'notification') {
        const u = await one("SELECT email, full_name FROM users WHERE id = ? AND status = 'ACTIVE'", [data.userId]);
        if (!u) return undefined;
        return emailService.deliver('notification', { to: u.email, name: u.full_name, title: data.title, body: data.body, link: data.link });
      }
      return emailService.deliver(data.template, data.data);
    }
    case 'push-notifications':
      return pushService.sendToUser(data.userId, data);
    case 'notifications':
      if (jobName === 'followup-sweep') return runFollowupSweep();
      return undefined;
    case 'analytics':
      return undefined;
    default:
      throw new Error(`Unknown queue ${queueName}`);
  }
}
