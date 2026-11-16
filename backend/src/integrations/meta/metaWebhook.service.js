/**
 * Meta webhook endpoint logic.
 *  GET  verification: echo hub.challenge when hub.verify_token matches META_WEBHOOK_VERIFY_TOKEN.
 *  POST delivery:     verify X-Hub-Signature-256 (HMAC-SHA256 of the raw body with the app secret), store each
 *                     leadgen change idempotently, queue processing, and answer 200 fast.
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { enqueue } from '../../workers/queues.js';
import { safeEqual } from '../../utils/crypto.js';
import { forbidden, unauthorized } from '../../utils/errors.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { PROVIDER } from './meta.config.js';

const META_ID = /^\d{1,32}$/;

/** Returns the challenge to echo, or throws 403. */
export function verifySubscription(q = {}) {
  const mode = q['hub.mode'];
  const token = q['hub.verify_token'];
  const challenge = q['hub.challenge'];
  if (!env.META_WEBHOOK_VERIFY_TOKEN) throw forbidden('Webhook verify token is not configured', 'META_WEBHOOK_NOT_CONFIGURED');
  if (mode !== 'subscribe' || typeof token !== 'string' || !safeEqual(token, env.META_WEBHOOK_VERIFY_TOKEN)) {
    throw forbidden('Webhook verification failed', 'META_WEBHOOK_VERIFY_FAILED');
  }
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) throw forbidden('Invalid challenge', 'META_WEBHOOK_VERIFY_FAILED');
  return challenge;
}

/** Constant-time check of "sha256=<hex>" against the raw request bytes. */
export function isValidSignature(rawBody, header, secret = env.META_APP_SECRET) {
  if (!secret || !rawBody || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(header.slice(7), expected);
}

/** Pull valid leadgen changes out of a webhook payload. Anything malformed is skipped (counted as ignored). */
export function extractLeadgenChanges(body) {
  const out = { changes: [], ignored: 0 };
  if (!body || typeof body !== 'object' || body.object !== 'page' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry.slice(0, 100)) {
    for (const ch of Array.isArray(entry?.changes) ? entry.changes.slice(0, 100) : []) {
      const v = ch?.value;
      if (ch?.field !== 'leadgen' || !v || !META_ID.test(String(v.leadgen_id || '')) || !META_ID.test(String(v.page_id || entry.id || ''))) {
        out.ignored += 1;
        continue;
      }
      out.changes.push({
        leadgenId: String(v.leadgen_id),
        pageId: String(v.page_id || entry.id),
        formId: META_ID.test(String(v.form_id || '')) ? String(v.form_id) : null,
        adId: META_ID.test(String(v.ad_id || '')) ? String(v.ad_id) : null,
        adgroupId: META_ID.test(String(v.adgroup_id || '')) ? String(v.adgroup_id) : null,
        createdTime: Number.isFinite(Number(v.created_time)) ? Number(v.created_time) : null,
      });
    }
  }
  return out;
}

/** Store and queue one leadgen notification. Returns { eventId, queued }. Re-deliveries are acknowledged, not re-queued. */
export async function recordLeadgenEvent(change, source = 'WEBHOOK') {
  const ins = await query(
    'INSERT IGNORE INTO meta_webhook_events (leadgen_id, page_id, form_id, ad_id, source, payload) VALUES (?, ?, ?, ?, ?, ?)',
    [change.leadgenId, change.pageId, change.formId, change.adId, source, JSON.stringify(change)],
  );
  if (ins.affectedRows) {
    await enqueue('lead-sync', 'meta-lead', { eventId: ins.insertId }, { jobId: `meta-${ins.insertId}` });
    return { eventId: ins.insertId, queued: true };
  }
  // Already known: re-queue only if the previous attempt failed.
  const [row] = await query('SELECT id, status FROM meta_webhook_events WHERE leadgen_id = ?', [change.leadgenId]);
  if (row?.status === 'FAILED') {
    await enqueue('lead-sync', 'meta-lead', { eventId: row.id }, { jobId: `meta-${row.id}-${Date.now()}` });
    return { eventId: row.id, queued: true };
  }
  return { eventId: row?.id || null, queued: false };
}

export const metaWebhook = {
  async receive(req) {
    if (!isValidSignature(req.rawBodyBuf, req.get('x-hub-signature-256'))) {
      await integrationLog(PROVIDER, 'warn', 'WEBHOOK_REJECTED', 'Webhook rejected: invalid signature', { ip: req.ip });
      throw unauthorized('Invalid signature', 'META_WEBHOOK_SIGNATURE');
    }
    const { changes, ignored } = extractLeadgenChanges(req.body);
    await repo.touchWebhook().catch(() => {});
    let queued = 0;
    for (const ch of changes) {
      const r = await recordLeadgenEvent(ch);
      if (r.queued) queued += 1;
    }
    if (changes.length || ignored) {
      await integrationLog(PROVIDER, 'info', 'WEBHOOK_RECEIVED', `Webhook received: ${changes.length} lead(s), ${queued} queued${ignored ? `, ${ignored} ignored` : ''}`,
        { leadgenIds: changes.map((c) => c.leadgenId).slice(0, 20), queued, ignored });
    }
    return { received: changes.length, queued, ignored };
  },

  async listEvents({ status, limit, offset }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [{ total }] = await query(`SELECT COUNT(*) total FROM meta_webhook_events ${where}`, params);
    const rows = await query(
      `SELECT id, leadgen_id, page_id, form_id, ad_id, source, status, lead_id, attempts, error, created_at, processed_at
       FROM meta_webhook_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },

  async retry(eventId) {
    const r = await query("UPDATE meta_webhook_events SET status = 'RECEIVED' WHERE id = ? AND status IN ('FAILED','IGNORED')", [eventId]);
    if (!r.affectedRows) return false;
    await enqueue('lead-sync', 'meta-lead', { eventId }, { jobId: `meta-${eventId}-retry-${Date.now()}` });
    return true;
  },
};
