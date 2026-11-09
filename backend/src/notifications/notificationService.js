import { query, one } from '../config/db.js';
import { enqueue } from '../workers/queues.js';
import { emitToUser, emitToSession, EVENTS } from '../realtime/socket.js';
import { NOTIFICATION_TYPES } from '../config/rbac.js';

async function preferencesFor(userId, type) {
  const p = await one('SELECT in_app, push, email FROM notification_preferences WHERE user_id = ? AND type = ?', [userId, type]);
  return p ? { inApp: !!p.in_app, push: !!p.push, email: !!p.email } : { inApp: true, push: true, email: false };
}

export const notificationService = {
  /** Create an in-app notification, emit it in real time, and queue push/email per the user's preferences. */
  async notify(userId, { type, title, body = null, link = null, data = null }) {
    const prefs = await preferencesFor(userId, type);
    let notification = null;
    if (prefs.inApp) {
      const res = await query(
        'INSERT INTO notifications (user_id, type, title, body, link, data) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, type, title.slice(0, 200), body?.slice(0, 1000) || null, link, data ? JSON.stringify(data) : null],
      );
      notification = { id: res.insertId, type, title, body, link, data, read_at: null, created_at: new Date().toISOString() };
      emitToUser(userId, EVENTS.NEW_NOTIFICATION, notification);
    }
    if (prefs.push) await enqueue('push-notifications', 'send', { userId, title, body, link, type });
    if (prefs.email) await enqueue('email', 'notification', { userId, title, body, link });
    return notification;
  },

  async notifyMany(userIds, payload) {
    for (const id of new Set(userIds)) await notificationService.notify(id, payload);
  },

  forceLogout(sessionId) {
    emitToSession(sessionId, EVENTS.FORCE_LOGOUT, { reason: 'SESSION_REVOKED' });
  },

  async list(userId, { unreadOnly, limit, offset }) {
    const where = unreadOnly ? 'user_id = ? AND read_at IS NULL' : 'user_id = ?';
    const [{ total }] = await query(`SELECT COUNT(*) total FROM notifications WHERE ${where}`, [userId]);
    const rows = await query(`SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [userId, limit, offset]);
    return { total, rows };
  },

  async unreadCount(userId) {
    const r = await one('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
    return r.c;
  },

  markRead: (userId, id) => query('UPDATE notifications SET read_at = NOW(3) WHERE id = ? AND user_id = ? AND read_at IS NULL', [id, userId]),
  markAllRead: (userId) => query('UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL', [userId]),

  async getPreferences(userId) {
    const rows = await query('SELECT type, in_app, push, email FROM notification_preferences WHERE user_id = ?', [userId]);
    const map = Object.fromEntries(rows.map((r) => [r.type, { inApp: !!r.in_app, push: !!r.push, email: !!r.email }]));
    return NOTIFICATION_TYPES.map((type) => ({ type, ...(map[type] || { inApp: true, push: true, email: false }) }));
  },

  async setPreferences(userId, prefs) {
    for (const p of prefs) {
      if (!NOTIFICATION_TYPES.includes(p.type)) continue;
      await query(
        `INSERT INTO notification_preferences (user_id, type, in_app, push, email) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE in_app = VALUES(in_app), push = VALUES(push), email = VALUES(email)`,
        [userId, p.type, p.inApp ? 1 : 0, p.push ? 1 : 0, p.email ? 1 : 0],
      );
    }
  },
};
