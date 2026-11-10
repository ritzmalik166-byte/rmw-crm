import { transaction, query, one } from '../config/db.js';
import { logger } from '../config/logger.js';
import { getAdapter } from '../integrations/index.js';
import { deriveSourceMedium } from '../integrations/canonical.js';
import { normalizePhone, normalizeEmail } from '../utils/normalize.js';
import { junkReason } from '../utils/junk.js';
import { settingsService } from './settingsService.js';
import { audit } from './auditService.js';
import { notificationService } from '../notifications/notificationService.js';
import { userRepo } from '../repositories/userRepo.js';
import { emitToWebsite, emitToUser, EVENTS } from '../realtime/socket.js';

const ATTR_COLS = ['source', 'medium', 'campaign', 'term', 'content', 'landing_page', 'referrer', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'page_name'];

async function sourceIdFor(code, conn) {
  if (!code) return null;
  const slug = String(code).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'other';
  await conn.query('INSERT IGNORE INTO lead_sources (code, name) VALUES (?, ?)', [slug, String(code).slice(0, 100)]);
  const [[row]] = await conn.query('SELECT id FROM lead_sources WHERE code = ?', [slug]);
  return row.id;
}

async function pickRoundRobinAssignee(websiteId, conn) {
  const [rows] = await conn.query(
    `SELECT u.id, (SELECT COUNT(*) FROM leads l JOIN lead_statuses s ON s.id = l.status_id
                   WHERE l.assigned_user_id = u.id AND s.is_closed = 0) AS open_leads
     FROM teams t JOIN team_members tm ON tm.team_id = t.id JOIN users u ON u.id = tm.user_id
     JOIN user_website_access x ON x.user_id = u.id AND x.website_id = t.website_id
     WHERE t.website_id = ? AND t.is_active = 1 AND u.status = 'ACTIVE'
     ORDER BY open_leads ASC, u.last_login_at DESC LIMIT 1`, [websiteId],
  );
  return rows[0]?.id || null;
}

const REPEAT_WINDOW_HOURS = 24;

/**
 * A repeat submission = same person (phone or real email) on the same website within 24h of an earlier real lead.
 * People often press "submit" several times; only the first one is a lead.
 */
async function isRepeatSubmission(websiteId, leadId, phoneN, emailN, receivedAt, conn) {
  const realEmail = emailN && !/^(homepage|services|home|noreply|no-reply)@/.test(emailN) ? emailN : null;
  if (!phoneN && !realEmail) return false;
  const at = receivedAt || new Date();
  const [rows] = await conn.query(
    `SELECT id FROM leads
     WHERE website_id = ? AND id <> ? AND junk_reason IS NULL AND merged_into_lead_id IS NULL
       AND ((? IS NOT NULL AND phone_normalized = ?) OR (? IS NOT NULL AND email_normalized = ?))
       AND COALESCE(external_created_at, created_at) BETWEEN DATE_SUB(?, INTERVAL ${REPEAT_WINDOW_HOURS} HOUR) AND ?
       AND (COALESCE(external_created_at, created_at) < ? OR id < ?)
     LIMIT 1`,
    [websiteId, leadId || 0, phoneN, phoneN, realEmail, realEmail, at, at, at, leadId || 2 ** 31],
  );
  return rows.length > 0;
}

async function detectDuplicates(lead, conn) {
  if (!lead.phone_normalized && !lead.email_normalized) return [];
  const [rows] = await conn.query(
    `SELECT id, phone_normalized, email_normalized, website_id FROM leads
     WHERE id <> ? AND merged_into_lead_id IS NULL
       AND ((? IS NOT NULL AND phone_normalized = ?) OR (? IS NOT NULL AND email_normalized = ?))
     ORDER BY id DESC LIMIT 10`,
    [lead.id, lead.phone_normalized, lead.phone_normalized, lead.email_normalized, lead.email_normalized],
  );
  for (const r of rows) {
    const reasons = [];
    if (lead.phone_normalized && r.phone_normalized === lead.phone_normalized) reasons.push('phone');
    if (lead.email_normalized && r.email_normalized === lead.email_normalized) reasons.push('email');
    if (r.website_id !== lead.website_id) reasons.push('cross_website');
    await conn.query('INSERT IGNORE INTO lead_duplicates (lead_id, candidate_lead_id, match_reasons) VALUES (?, ?, ?)', [lead.id, r.id, JSON.stringify(reasons)]);
  }
  if (rows.length) await conn.query('UPDATE leads SET is_duplicate_suspect = 1 WHERE id = ?', [lead.id]);
  return rows.map((r) => r.id);
}

/**
 * Upsert a canonical lead. New leads are created with full attribution; existing leads (same website + external id)
 * only have empty fields filled in, so CRM edits, status and assignment are never overwritten by a re-sync.
 */
export async function upsertCanonicalLead(website, c, { silent = false } = {}) {
  const externalLeadId = `${website.external_id_prefix}-${c.externalRawId}`;
  const phoneN = normalizePhone(c.phone);
  const emailN = normalizeEmail(c.email);
  const autoAssign = await settingsService.get('leads.auto_assign');
  const contentJunk = junkReason({ name: c.name, email: c.email, phone: c.phone, message: c.message, formType: c.formType, websiteCode: website.code });

  const result = await transaction(async (conn) => {
    const [[existing]] = await conn.query('SELECT * FROM leads WHERE website_id = ? AND external_lead_id = ? FOR UPDATE', [website.id, externalLeadId]);
    const derived = deriveSourceMedium(c.attribution, website.domain);
    const attr = { ...c.attribution, source: derived.source, medium: derived.medium, campaign: derived.campaign, term: derived.term, content: derived.content };

    if (existing) {
      await conn.query(
        `UPDATE leads SET name = COALESCE(name, ?), phone = COALESCE(phone, ?), phone_normalized = COALESCE(phone_normalized, ?),
           email = COALESCE(email, ?), email_normalized = COALESCE(email_normalized, ?), location = COALESCE(location, ?),
           interest = COALESCE(interest, ?), message = COALESCE(message, ?), external_created_at = COALESCE(external_created_at, ?),
           extra = JSON_MERGE_PATCH(COALESCE(extra, JSON_OBJECT()), ?), raw_payload = ?
         WHERE id = ?`,
        [c.name, c.phone, phoneN, c.email, emailN, c.location, c.interest, c.message, c.externalCreatedAt,
          JSON.stringify(c.extra || {}), JSON.stringify(c.raw || {}), existing.id],
      );
      // Re-evaluate junk on every sync so rule changes also apply to already-imported leads.
      const junk = contentJunk || ((await isRepeatSubmission(website.id, existing.id, existing.phone_normalized || phoneN, existing.email_normalized || emailN, existing.external_created_at || c.externalCreatedAt, conn)) ? 'repeat' : null);
      await conn.query('UPDATE leads SET junk_reason = ? WHERE id = ?', [junk, existing.id]);
      const sets = ATTR_COLS.map((col) => `${col} = COALESCE(${col}, ?)`).join(', ');
      await conn.query(
        `INSERT INTO lead_attributions (lead_id, ${ATTR_COLS.join(', ')}, extra) VALUES (?, ${ATTR_COLS.map(() => '?').join(', ')}, ?)
         ON DUPLICATE KEY UPDATE ${sets}, extra = JSON_MERGE_PATCH(COALESCE(extra, JSON_OBJECT()), VALUES(extra))`,
        [existing.id, ...ATTR_COLS.map((k) => attr[k] ?? null), JSON.stringify(attr.extra || {}), ...ATTR_COLS.map((k) => attr[k] ?? null)],
      );
      await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_SYNCED', ?)", [existing.id, JSON.stringify({ via: 'integration' })]);
      return { leadId: existing.id, created: false, externalLeadId, junk };
    }

    let status = null;
    if (c.initialStatusCode) [[status]] = await conn.query('SELECT id FROM lead_statuses WHERE code = ? AND is_active = 1', [c.initialStatusCode]);
    if (!status) [[status]] = await conn.query('SELECT id FROM lead_statuses WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order LIMIT 1');
    const junk = contentJunk || ((await isRepeatSubmission(website.id, null, phoneN, emailN, c.externalCreatedAt, conn)) ? 'repeat' : null);
    const sourceId = await sourceIdFor(derived.source, conn);
    const assignee = !junk && autoAssign === 'ROUND_ROBIN_TEAM' ? await pickRoundRobinAssignee(website.id, conn) : null;
    const [ins] = await conn.query(
      `INSERT INTO leads (website_id, external_lead_id, external_raw_id, name, phone, phone_normalized, email, email_normalized,
         location, interest, message, form_type, status_id, source_id, assigned_user_id, extra, raw_payload, external_created_at, junk_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [website.id, externalLeadId, c.externalRawId, c.name, c.phone, phoneN, c.email, emailN, c.location, c.interest, c.message,
        c.formType, status.id, sourceId, assignee, JSON.stringify(c.extra || {}), JSON.stringify(c.raw || {}), c.externalCreatedAt, junk],
    );
    const leadId = ins.insertId;
    await conn.query(
      `INSERT INTO lead_attributions (lead_id, ${ATTR_COLS.join(', ')}, extra) VALUES (?, ${ATTR_COLS.map(() => '?').join(', ')}, ?)`,
      [leadId, ...ATTR_COLS.map((k) => attr[k] ?? null), JSON.stringify(attr.extra || {})],
    );
    await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_CREATED', ?)", [leadId, JSON.stringify({ website: website.code, externalLeadId, source: derived.source })]);
    if (assignee) {
      await conn.query("INSERT INTO lead_assignments (lead_id, assigned_user_id, reason) VALUES (?, ?, 'auto_round_robin')", [leadId, assignee]);
      await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_ASSIGNED', ?)", [leadId, JSON.stringify({ to: assignee, auto: true })]);
    }
    const duplicates = await detectDuplicates({ id: leadId, website_id: website.id, phone_normalized: phoneN, email_normalized: emailN }, conn);
    return { leadId, created: true, externalLeadId, assignee, duplicates, junk };
  });

  // Pull sync passes silent: true; it still alerts for genuinely new enquiries (submitted in the last day),
  // so a backfill of old leads does not flood everyone with notifications.
  const fresh = !c.externalCreatedAt || Date.now() - new Date(c.externalCreatedAt).getTime() < 24 * 3600_000;
  const isCareer = result.junk === 'career';
  if (result.created && (!silent || fresh) && (!result.junk || isCareer)) {
    await audit('LEAD_CREATED', { entityType: 'lead', entityId: result.leadId, meta: { website: website.code, externalLeadId, via: 'integration' } });
    const kind = isCareer ? 'career application' : 'lead';
    const summary = { id: result.leadId, externalLeadId, website: website.code, name: c.name, interest: c.interest, kind };
    emitToWebsite(website.id, EVENTS.NEW_LEAD, summary);
    const watchers = await userRepo.usersWithPermission('lead.assign', website.id);
    await notificationService.notifyMany(watchers.map((w) => w.id), {
      type: 'NEW_LEAD', title: `New ${website.code} ${kind}`, body: `${c.name || 'Unnamed'}${c.interest ? ` · ${c.interest}` : ''}`,
      link: `/crm/leads/${result.leadId}`, data: { leadId: result.leadId },
    });
    if (result.assignee) {
      await audit('LEAD_ASSIGNED', { entityType: 'lead', entityId: result.leadId, meta: { to: result.assignee, auto: true } });
      emitToUser(result.assignee, EVENTS.LEAD_ASSIGNED, summary);
      await notificationService.notify(result.assignee, {
        type: 'LEAD_ASSIGNED', title: 'New lead assigned to you', body: `${c.name || 'Unnamed'} (${website.code})`, link: `/crm/leads/${result.leadId}`,
      });
    }
  }
  return result;
}

/** Process one stored integration event (called by the lead-sync worker, with retries). */
export async function processIntegrationEvent(eventId) {
  const event = await one(
    `SELECT e.*, w.code, w.domain, w.external_id_prefix FROM integration_events e JOIN websites w ON w.id = e.website_id WHERE e.id = ?`, [eventId],
  );
  if (!event || ['PROCESSED', 'DUPLICATE'].includes(event.status)) return;
  await query("UPDATE integration_events SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = ?", [eventId]);
  const website = { id: event.website_id, code: event.code, domain: event.domain, external_id_prefix: event.external_id_prefix };
  try {
    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    const canonical = getAdapter(website.code).normalize(payload);
    canonical.raw = payload;
    const res = await upsertCanonicalLead(website, canonical);
    await query("UPDATE integration_events SET status = ?, lead_id = ?, processed_at = NOW(3), error = NULL WHERE id = ?", [res.created ? 'PROCESSED' : 'DUPLICATE', res.leadId, eventId]);
    await query('UPDATE website_integrations SET last_success_at = NOW(3), success_count = success_count + 1 WHERE website_id = ?', [website.id]);
  } catch (err) {
    const msg = String(err.message).slice(0, 1000);
    await query("UPDATE integration_events SET status = 'FAILED', error = ? WHERE id = ?", [msg, eventId]);
    await query('UPDATE website_integrations SET last_failure_at = NOW(3), last_error = ?, failure_count = failure_count + 1 WHERE website_id = ?', [msg, website.id]);
    logger.error({ eventId, err: msg }, 'Integration event failed');
    if (!err.expose) throw err; // transient errors are retried by BullMQ; validation errors are not
  }
}
