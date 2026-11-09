import { query, one } from '../config/db.js';
import { getAdapter } from '../integrations/index.js';
import { enqueue } from '../workers/queues.js';
import { audit } from './auditService.js';
import { randomToken, sha256, hmacSha256, safeEqual, encrypt, decrypt } from '../utils/crypto.js';
import { unauthorized, badRequest, notFound } from '../utils/errors.js';
import { clientIp } from '../utils/http.js';

const SIGNATURE_TOLERANCE_S = 300;

function extractKey(req) {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.get('x-crm-key') || req.get('x-mpf-crm-key') || null; // x-mpf-crm-key: header used by mpf-backend today
}

export const integrationService = {
  /** Authenticate a source website by API key (+ HMAC signature when required). */
  async authenticateSource(req, websiteCodeParam) {
    const key = extractKey(req);
    if (!key) throw unauthorized('Missing integration key', 'INTEGRATION_AUTH');
    const row = await one(
      `SELECT wi.*, w.code, w.domain, w.external_id_prefix, w.is_active AS website_active FROM website_integrations wi
       JOIN websites w ON w.id = wi.website_id WHERE wi.api_key_hash = ?`, [sha256(key)],
    );
    if (!row || !row.is_active || !row.website_active) throw unauthorized('Invalid integration key', 'INTEGRATION_AUTH');
    if (websiteCodeParam && websiteCodeParam.toUpperCase() !== row.code) throw unauthorized('Key does not belong to this website', 'INTEGRATION_AUTH');

    if (row.require_signature) {
      const ts = Number(req.get('x-crm-timestamp'));
      const sig = (req.get('x-crm-signature') || '').replace(/^sha256=/, '');
      if (!ts || Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_S) throw unauthorized('Stale or missing timestamp', 'INTEGRATION_SIGNATURE');
      const expected = hmacSha256(decrypt(row.hmac_secret_enc), `${ts}.${req.rawBody || ''}`);
      if (!sig || !safeEqual(sig, expected)) throw unauthorized('Invalid signature', 'INTEGRATION_SIGNATURE');
    }
    await query('UPDATE website_integrations SET last_received_at = NOW(3) WHERE id = ?', [row.id]);
    return { id: row.website_id, code: row.code, domain: row.domain, external_id_prefix: row.external_id_prefix };
  },

  /**
   * Validate + store the event, then queue processing. Identical re-deliveries are acknowledged without re-processing
   * (idempotency); a changed payload for the same lead is processed as an update.
   */
  async receive(req, website, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('Payload must be a JSON object', 'VALIDATION_ERROR');
    const canonical = getAdapter(website.code).normalize(payload); // validates before accepting
    const idem = (req.get('idempotency-key') || sha256(JSON.stringify(payload))).slice(0, 190);
    const ins = await query(
      'INSERT IGNORE INTO integration_events (website_id, idempotency_key, payload, ip_address) VALUES (?, ?, ?, ?)',
      [website.id, idem, JSON.stringify(payload), clientIp(req)],
    );
    const externalLeadId = `${website.external_id_prefix}-${canonical.externalRawId}`;
    if (!ins.affectedRows) {
      const existing = await one('SELECT id, status, lead_id FROM integration_events WHERE website_id = ? AND idempotency_key = ?', [website.id, idem]);
      if (existing.status === 'FAILED') await enqueue('lead-sync', 'process', { eventId: existing.id }, { jobId: `evt-${existing.id}-${Date.now()}` });
      return { eventId: existing.id, externalLeadId, duplicate: true, status: existing.status };
    }
    await enqueue('lead-sync', 'process', { eventId: ins.insertId }, { jobId: `evt-${ins.insertId}` });
    return { eventId: ins.insertId, externalLeadId, duplicate: false, status: 'RECEIVED' };
  },

  async health() {
    return query(
      `SELECT w.id AS website_id, w.code, w.name, wi.method, wi.is_active, wi.require_signature, wi.api_key_prefix,
              wi.last_received_at, wi.last_success_at, wi.last_failure_at, wi.last_error, wi.success_count, wi.failure_count, wi.key_rotated_at,
              (SELECT COUNT(*) FROM integration_events e WHERE e.website_id = w.id AND e.status = 'FAILED') AS failed_events,
              (SELECT COUNT(*) FROM integration_events e WHERE e.website_id = w.id AND e.status IN ('RECEIVED','PROCESSING')) AS pending_events,
              (SELECT COUNT(*) FROM integration_events e WHERE e.website_id = w.id AND e.created_at > NOW(3) - INTERVAL 1 DAY) AS events_24h
       FROM websites w LEFT JOIN website_integrations wi ON wi.website_id = w.id ORDER BY w.id`,
    );
  },

  async events({ websiteId, status, limit, offset }) {
    const where = ['1=1']; const params = [];
    if (websiteId) { where.push('e.website_id = ?'); params.push(websiteId); }
    if (status) { where.push('e.status = ?'); params.push(status); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) total FROM integration_events e WHERE ${w}`, params);
    const rows = await query(
      `SELECT e.id, w.code AS website, e.status, e.lead_id, e.attempts, e.error, e.created_at, e.processed_at
       FROM integration_events e JOIN websites w ON w.id = e.website_id WHERE ${w} ORDER BY e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },

  async retryEvent(eventId, req) {
    const e = await one('SELECT id, status FROM integration_events WHERE id = ?', [eventId]);
    if (!e) throw notFound('Event not found');
    await query("UPDATE integration_events SET status = 'RECEIVED' WHERE id = ?", [eventId]);
    await enqueue('lead-sync', 'process', { eventId }, { jobId: `evt-${eventId}-retry-${Date.now()}` });
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'integration_event', entityId: eventId, req, meta: { action: 'retry' } });
  },

  /** Generates a new API key (and HMAC secret). Returned once; only hashes / encrypted values are stored. */
  async rotateKey(websiteId, { requireSignature }, actorId = null, req = null) {
    const w = await one('SELECT id, code FROM websites WHERE id = ?', [websiteId]);
    if (!w) throw notFound('Website not found');
    const prefix = `crm_${w.code.toLowerCase()}`;
    const apiKey = `${prefix}_${randomToken(32)}`;
    const hmacSecret = randomToken(32);
    await query(
      `INSERT INTO website_integrations (website_id, api_key_prefix, api_key_hash, hmac_secret_enc, require_signature, key_rotated_at)
       VALUES (?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE api_key_prefix = VALUES(api_key_prefix), api_key_hash = VALUES(api_key_hash),
         hmac_secret_enc = VALUES(hmac_secret_enc), require_signature = VALUES(require_signature), key_rotated_at = NOW(3)`,
      [websiteId, prefix, sha256(apiKey), encrypt(hmacSecret), requireSignature ? 1 : 0],
    );
    await audit('INTEGRATION_CHANGED', { actorId, entityType: 'website', entityId: websiteId, req, meta: { action: 'rotate_key', requireSignature: !!requireSignature } });
    return { website: w.code, apiKey, hmacSecret, requireSignature: !!requireSignature };
  },

  async update(websiteId, { isActive, requireSignature }, req) {
    await query(
      'UPDATE website_integrations SET is_active = COALESCE(?, is_active), require_signature = COALESCE(?, require_signature) WHERE website_id = ?',
      [isActive === undefined ? null : isActive ? 1 : 0, requireSignature === undefined ? null : requireSignature ? 1 : 0, websiteId],
    );
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'website', entityId: websiteId, req, meta: { isActive, requireSignature } });
  },
};
