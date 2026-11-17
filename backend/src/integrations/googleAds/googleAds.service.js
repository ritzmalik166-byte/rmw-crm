/**
 * Google Ads lead form webhook integration.
 *  - Google POSTs each lead form submission to /api/integrations/google-ads/webhook with the key configured on the form.
 *  - The key is compared in constant time; wrong/missing key -> 401 (so "Send test data" in Google Ads shows the error).
 *  - Each delivery is stored idempotently (google_ads_lead_events) and imported inline through the shared Lead Processor,
 *    so the lead appears in the CRM in real time (NEW_LEAD socket event + notifications), like Meta.
 *  - Test deliveries (is_test) are imported as junk 'test' so they never reach the sales pipeline.
 */
import { env } from '../../config/env.js';
import { query, one } from '../../config/db.js';
import { encrypt, decrypt, randomToken, safeEqual } from '../../utils/crypto.js';
import { badRequest, conflict, unauthorized } from '../../utils/errors.js';
import { audit } from '../../services/auditService.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { upsertCanonicalLead } from '../../services/leadIngestService.js';
import { normalizeGoogleAdsLead } from './googleAdsLead.js';

export const PROVIDER = 'GOOGLE_ADS';

const settings = () => one('SELECT * FROM google_ads_settings WHERE id = 1');

function storedKey(s) {
  if (!s?.webhook_key_enc) return null;
  try { return decrypt(s.webhook_key_enc); } catch { return null; }
}

/** Public URL Google must call. GOOGLE_ADS_WEBHOOK_URL wins; else the API origin (from META_REDIRECT_URI) or APP_URL. */
export function webhookUrl() {
  if (env.GOOGLE_ADS_WEBHOOK_URL) return env.GOOGLE_ADS_WEBHOOK_URL;
  let base = env.APP_URL;
  if (env.META_REDIRECT_URI) { try { base = new URL(env.META_REDIRECT_URI).origin; } catch { /* ignore */ } }
  return `${String(base).replace(/\/$/, '')}/api/integrations/google-ads/webhook`;
}

/** UI state: NOT_CONNECTED | SETUP_REQUIRED | CONNECTED. Pure; exported for tests. */
export function googleAdsState(s) {
  if (!s || !s.is_active) return 'NOT_CONNECTED';
  if (!s.webhook_key_enc || !s.website_id) return 'SETUP_REQUIRED';
  return 'CONNECTED';
}

async function importEvent(eventId, body, s) {
  const website = await one('SELECT id, code, domain, external_id_prefix FROM websites WHERE id = ?', [s.website_id]);
  if (!website) throw badRequest('Choose the CRM website for Google Ads leads in Integrations', 'GOOGLE_ADS_NO_WEBSITE');
  await query('UPDATE google_ads_lead_events SET attempts = attempts + 1 WHERE id = ?', [eventId]);
  try {
    const canonical = normalizeGoogleAdsLead(body);
    const res = await upsertCanonicalLead(website, canonical, { assignment: { teamId: s.assignment_team_id || null } });
    await query('UPDATE google_ads_lead_events SET status = ?, lead_id = ?, error = NULL, processed_at = NOW(3) WHERE id = ?',
      [res.created ? 'PROCESSED' : 'DUPLICATE', res.leadId, eventId]);
    if (res.created) {
      await query(`UPDATE google_ads_settings SET ${canonical.forceJunk ? 'last_test_at' : 'last_lead_at'} = NOW(3) WHERE id = 1`);
    }
    await integrationLog(PROVIDER, 'info', res.created ? 'LEAD_IMPORTED' : 'DUPLICATE_DETECTED',
      `${canonical.forceJunk ? 'Test lead' : 'Lead'} ${canonical.sourceLeadId} ${res.created ? 'imported' : 'already exists; existing lead updated'}`,
      { googleLeadId: canonical.sourceLeadId, leadId: res.leadId, assigned: Boolean(res.assignee), junk: res.junk || null });
    return res;
  } catch (err) {
    const msg = String(err.message || err).slice(0, 1000);
    await query("UPDATE google_ads_lead_events SET status = 'FAILED', error = ? WHERE id = ?", [msg, eventId]);
    await integrationLog(PROVIDER, 'error', 'LEAD_FAILED', `Google Ads lead failed: ${msg}`, { eventId });
    throw err;
  }
}

export const googleAds = {
  /** POST webhook. Returns a small summary; throws 401 on a bad key. */
  async receive(body) {
    const s = await settings();
    const key = storedKey(s);
    const sent = typeof body?.google_key === 'string' ? body.google_key : '';
    if (!key || !sent || !safeEqual(sent, key)) {
      await integrationLog(PROVIDER, 'warn', 'WEBHOOK_REJECTED', 'Webhook rejected: wrong or missing key', { leadId: String(body?.lead_id || '').slice(0, 60) || null });
      throw unauthorized('Invalid key', 'GOOGLE_ADS_WEBHOOK_KEY');
    }
    await query('UPDATE google_ads_settings SET last_webhook_at = NOW(3) WHERE id = 1');

    const leadId = String(body?.lead_id ?? '').trim().slice(0, 190);
    if (!leadId) throw badRequest('lead_id is required', 'GOOGLE_ADS_INVALID_LEAD');
    const { google_key: _omit, ...safePayload } = body; // never store the key
    const isTest = body.is_test === true || body.is_test === 'true';

    const ins = await query(
      `INSERT IGNORE INTO google_ads_lead_events (google_lead_id, form_id, campaign_id, adgroup_id, is_test, payload) VALUES (?, ?, ?, ?, ?, ?)`,
      [leadId, body.form_id != null ? String(body.form_id).slice(0, 64) : null, body.campaign_id != null ? String(body.campaign_id).slice(0, 64) : null,
        body.adgroup_id != null ? String(body.adgroup_id).slice(0, 64) : null, isTest ? 1 : 0, JSON.stringify(safePayload)],
    );
    let eventId = ins.insertId;
    if (!ins.affectedRows) {
      const row = await one('SELECT id, status FROM google_ads_lead_events WHERE google_lead_id = ?', [leadId]);
      if (row?.status !== 'FAILED') return { received: true, duplicate: true };
      eventId = row.id;
    }

    if (!s.is_active) {
      await query("UPDATE google_ads_lead_events SET status = 'IGNORED', error = 'Google Ads integration is disconnected', processed_at = NOW(3) WHERE id = ?", [eventId]);
      return { received: true, ignored: true };
    }
    // Process inline so the lead shows up immediately. Failures are kept for Retry; Google still gets 200.
    try {
      const res = await importEvent(eventId, safePayload, s);
      return { received: true, created: res.created };
    } catch {
      return { received: true, queuedForRetry: true };
    }
  },

  async status({ includeKey = false } = {}) {
    const s = await settings();
    const counts = await one(
      `SELECT COUNT(*) total, SUM(status = 'FAILED') failed, SUM(created_at > NOW(3) - INTERVAL 1 DAY) last24h FROM google_ads_lead_events`,
    );
    const website = s?.website_id ? await one('SELECT id, code, name FROM websites WHERE id = ?', [s.website_id]) : null;
    return {
      state: googleAdsState(s),
      webhookUrl: webhookUrl(),
      webhookKey: includeKey ? storedKey(s) : undefined,
      hasKey: Boolean(s?.webhook_key_enc),
      keyRotatedAt: s?.key_rotated_at || null,
      website,
      assignmentTeamId: s?.assignment_team_id || null,
      lastWebhookAt: s?.last_webhook_at || null,
      lastLeadAt: s?.last_lead_at || null,
      lastTestAt: s?.last_test_at || null,
      events: { total: Number(counts?.total || 0), failed: Number(counts?.failed || 0), last24h: Number(counts?.last24h || 0) },
    };
  },

  /** Save target website/team and activate. Generates the webhook key on first activation. */
  async saveSettings(req, { websiteId, assignmentTeamId }) {
    const website = await one('SELECT id, code FROM websites WHERE id = ?', [websiteId]);
    if (!website) throw badRequest('Unknown website', 'GOOGLE_ADS_NO_WEBSITE');
    if (assignmentTeamId) {
      const team = await one('SELECT id FROM teams WHERE id = ?', [assignmentTeamId]);
      if (!team) throw badRequest('Unknown team');
    }
    const s = await settings();
    const newKey = s?.webhook_key_enc ? null : randomToken(24);
    await query(
      `UPDATE google_ads_settings SET is_active = 1, website_id = ?, assignment_team_id = ?, updated_by = ?
         ${newKey ? ', webhook_key_enc = ?, key_rotated_at = NOW(3)' : ''} WHERE id = 1`,
      [websiteId, assignmentTeamId || null, req.auth.user.id, ...(newKey ? [encrypt(newKey)] : [])],
    );
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'google_ads', req, meta: { action: 'google_ads_settings', websiteId, assignmentTeamId: assignmentTeamId || null } });
    await integrationLog(PROVIDER, 'info', 'SETTINGS_SAVED', `Google Ads leads go to ${website.code}`, { websiteId, assignmentTeamId: assignmentTeamId || null });
    return this.status({ includeKey: true });
  },

  /** New key: every Google Ads lead form must be updated with it. */
  async rotateKey(req) {
    await query('UPDATE google_ads_settings SET webhook_key_enc = ?, key_rotated_at = NOW(3), updated_by = ? WHERE id = 1', [encrypt(randomToken(24)), req.auth.user.id]);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'google_ads', req, meta: { action: 'google_ads_rotate_key' } });
    await integrationLog(PROVIDER, 'warn', 'KEY_ROTATED', 'Webhook key rotated; update every Google Ads lead form with the new key');
    return this.status({ includeKey: true });
  },

  async disconnect(req) {
    await query('UPDATE google_ads_settings SET is_active = 0, updated_by = ? WHERE id = 1', [req.auth.user.id]);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'google_ads', req, meta: { action: 'google_ads_disconnect' } });
    await integrationLog(PROVIDER, 'info', 'DISCONNECTED', 'Google Ads disconnected; incoming leads are ignored');
    return { disconnected: true };
  },

  async listEvents({ status, limit, offset }) {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const [{ total }] = await query(`SELECT COUNT(*) total FROM google_ads_lead_events ${where}`, params);
    const rows = await query(
      `SELECT id, google_lead_id, form_id, campaign_id, adgroup_id, is_test, status, lead_id, attempts, error, created_at, processed_at
       FROM google_ads_lead_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },

  async retry(eventId) {
    const s = await settings();
    if (googleAdsState(s) !== 'CONNECTED') throw conflict('Connect Google Ads and choose a website first', 'GOOGLE_ADS_NOT_CONNECTED');
    const ev = await one("SELECT id, payload FROM google_ads_lead_events WHERE id = ? AND status IN ('FAILED','IGNORED')", [eventId]);
    if (!ev) return false;
    const payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : ev.payload;
    await importEvent(ev.id, payload, s);
    return true;
  },
};
