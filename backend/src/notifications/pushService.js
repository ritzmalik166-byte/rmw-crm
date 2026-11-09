import webpush from 'web-push';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { sha256 } from '../utils/crypto.js';

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export const pushService = {
  publicKey: () => env.VAPID_PUBLIC_KEY || null,

  async subscribe(userId, sub, userAgent) {
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
      [userId, sub.endpoint, sha256(sub.endpoint), sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 500) || null],
    );
  },

  unsubscribe: (userId, endpoint) => query('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [userId, sha256(endpoint)]),

  /** Send to every subscription of the user (multiple browsers/devices). Expired subscriptions are removed. */
  async sendToUser(userId, { title, body, link, type }) {
    if (!configured) return;
    const subs = await query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
    const payload = JSON.stringify({ title, body, url: link || '/crm/notifications', tag: type });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        await query('UPDATE push_subscriptions SET last_used_at = NOW(3) WHERE id = ?', [s.id]);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await query('DELETE FROM push_subscriptions WHERE id = ?', [s.id]);
        else logger.warn({ status: err.statusCode, sub: s.id }, 'Push send failed');
      }
    }));
  },
};
