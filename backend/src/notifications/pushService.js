import webpush from 'web-push';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { sha256 } from '../utils/crypto.js';

const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/** Browser push (VAPID) to every subscribed browser of the user. Expired subscriptions are removed. */
async function sendWeb(userId, { title, body, link, type }) {
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
}

/**
 * Native push to the mobile app through Expo's push service (which relays to FCM / APNs).
 * Tokens Expo reports as DeviceNotRegistered are deleted.
 */
async function sendExpo(userId, { title, body, link, type, data }) {
  const rows = await query('SELECT id, token FROM expo_push_tokens WHERE user_id = ?', [userId]);
  if (!rows.length) return;
  const messages = rows.map((r) => ({
    to: r.token,
    title,
    body: body || undefined,
    sound: 'default',
    priority: 'high',
    channelId: 'default',
    data: { ...(data || {}), link: link || null, type: type || null },
  }));
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
      const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(batch), signal: AbortSignal.timeout(10_000) });
      const json = await res.json().catch(() => null);
      const tickets = Array.isArray(json?.data) ? json.data : [];
      await Promise.all(tickets.map(async (t, j) => {
        const row = rows[i + j];
        if (!row) return;
        if (t.status === 'ok') return query('UPDATE expo_push_tokens SET last_used_at = NOW(3) WHERE id = ?', [row.id]);
        if (t.details?.error === 'DeviceNotRegistered') return query('DELETE FROM expo_push_tokens WHERE id = ?', [row.id]);
        logger.warn({ error: t.details?.error, message: t.message, token: row.id }, 'Expo push rejected');
        return undefined;
      }));
      if (!res.ok) logger.warn({ status: res.status, body: JSON.stringify(json).slice(0, 300) }, 'Expo push request failed');
    } catch (err) {
      logger.warn({ err: err.message }, 'Expo push request error');
    }
  }
}

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

  isExpoToken: (t) => EXPO_TOKEN_RE.test(String(t || '')),

  /** Register (or move) a mobile app token to the signed-in user. A device belongs to one user at a time. */
  registerExpo: (userId, { token, platform, deviceName }) => query(
    `INSERT INTO expo_push_tokens (user_id, token, platform, device_name) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), device_name = VALUES(device_name)`,
    [userId, token, platform?.slice(0, 20) || null, deviceName?.slice(0, 150) || null],
  ),

  unregisterExpo: (userId, token) => query('DELETE FROM expo_push_tokens WHERE user_id = ? AND token = ?', [userId, token]),

  /** Send to every browser and every app install of the user. */
  async sendToUser(userId, payload) {
    await Promise.all([sendWeb(userId, payload), sendExpo(userId, payload)]);
  },
};
