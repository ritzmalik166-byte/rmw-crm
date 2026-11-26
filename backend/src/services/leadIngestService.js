import { transaction, query, one } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getAdapter } from '../integrations/index.js';
import { deriveSourceMedium } from '../integrations/canonical.js';
import { normalizePhone, normalizeEmail } from '../utils/normalize.js';
import { junkReason } from '../utils/junk.js';
import { settingsService } from './settingsService.js';
import { audit } from './auditService.js';
import { notificationService } from '../notifications/notificationService.js';
import { userRepo } from '../repositories/userRepo.js';
import { scheduleForNewLead } from '../integrations/aicall/aiCall.service.js';
import { emitToWebsite, emitToUser, EVENTS } from '../realtime/socket.js';
import { pickAssignee } from './leadAssignmentService.js';
import { findBySourceLeadId, flagDuplicates } from './duplicateDetectionService.js';
import { LEAD_SOURCE_TYPES } from '../config/leadSources.js';

const ATTR_COLS = ['source', 'medium', 'campaign', 'term', 'content', 'landing_page', 'referrer', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'msclkid', 'page_name'];

/** Ad-platform attribution columns on leads, mapped from canonical.ad (camelCase). */
const AD_COLS = [['campaign_id', 'campaignId'], ['campaign_name', 'campaignName'], ['ad_set_id', 'adSetId'], ['ad_set_name', 'adSetName'],
  ['ad_id', 'adId'], ['ad_name', 'adName'], ['form_id', 'formId'], ['form_name', 'formName'], ['page_id', 'pageId'], ['instagram_account_id', 'instagramAccountId']];
const adVal = (c, key) => (c.ad && c.ad[key] != null && c.ad[key] !== '' ? String(c.ad[key]).slice(0, 255) : null);

async function sourceIdFor(code, conn) {
  if (!code) return null;
  const slug = String(code).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'other';
  await conn.query('INSERT IGNORE INTO lead_sources (code, name) VALUES (?, ?)', [slug, String(code).slice(0, 100)]);
  const [[row]] = await conn.query('SELECT id FROM lead_sources WHERE code = ?', [slug]);
  return row.id;
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

/**
 * The shared Lead Processor. Every source (website webhooks/pull sync, Meta Lead Ads, and later WhatsApp)
 * normalises to the canonical shape and lands here, so there is exactly one lead pipeline.
 *
 * New leads are created with full attribution; existing leads only have empty fields filled in, so CRM edits,
 * status and assignment are never overwritten by a re-delivery or re-sync.
 *
 * Optional canonical fields (ad-platform sources):
 *   externalLeadId                explicit CRM lead id (default `${website prefix}-${externalRawId}`)
 *   sourceType, sourceLeadId      provider + its lead id; matched first (duplicate priority 1)
 *   ad: { campaignId, campaignName, adSetId, adSetName, adId, adName, formId, formName, pageId, instagramAccountId }
 *   externalMetadata              provider data kept verbatim (e.g. all form answers)
 *   attributionOverride           { source, medium, campaign, term, content } used instead of UTM/referrer derivation
 *   receivedActivity              { type, meta } extra timeline entry after LEAD_CREATED
 *   notify                        { title, body } for the "new lead" notification
 * Options: { silent, assignment: { teamId } }
 */
export async function upsertCanonicalLead(website, c, { silent = false, assignment = null } = {}) {
  const externalLeadId = c.externalLeadId || `${website.external_id_prefix}-${c.externalRawId}`;
  const sourceType = c.sourceType || LEAD_SOURCE_TYPES.WEBSITE;
  const sourceLeadId = c.sourceLeadId ? String(c.sourceLeadId).slice(0, 100) : null;
  const phoneN = normalizePhone(c.phone);
  const emailN = normalizeEmail(c.email);
  const autoAssign = await settingsService.get('leads.auto_assign');
  const contentJunk = junkReason({ name: c.name, email: c.email, phone: c.phone, message: c.message, formType: c.formType, websiteCode: website.code });

  const result = await transaction(async (conn) => {
    let existing = sourceLeadId ? await findBySourceLeadId(sourceType, sourceLeadId, conn, { lock: true }) : null;
    if (!existing) [[existing]] = await conn.query('SELECT * FROM leads WHERE website_id = ? AND external_lead_id = ? FOR UPDATE', [website.id, externalLeadId]);
    const derived = c.attributionOverride
      ? { source: null, medium: null, campaign: null, term: null, content: null, ...c.attributionOverride }
      : deriveSourceMedium(c.attribution, website.domain);
    const attr = { ...c.attribution, source: derived.source, medium: derived.medium, campaign: derived.campaign, term: derived.term, content: derived.content };

    if (existing) {
      await conn.query(
        `UPDATE leads SET name = COALESCE(name, ?), phone = COALESCE(phone, ?), phone_normalized = COALESCE(phone_normalized, ?),
           email = COALESCE(email, ?), email_normalized = COALESCE(email_normalized, ?), location = COALESCE(location, ?),
           interest = COALESCE(interest, ?), message = COALESCE(message, ?), external_created_at = COALESCE(external_created_at, ?),
           extra = JSON_MERGE_PATCH(COALESCE(extra, JSON_OBJECT()), ?), raw_payload = ?,
           ${AD_COLS.map(([col]) => `${col} = COALESCE(${col}, ?)`).join(', ')}
         WHERE id = ?`,
        [c.name, c.phone, phoneN, c.email, emailN, c.location, c.interest, c.message, c.externalCreatedAt,
          JSON.stringify(c.extra || {}), JSON.stringify(c.raw || {}), ...AD_COLS.map(([, k]) => adVal(c, k)), existing.id],
      );
      if (c.externalMetadata) {
        await conn.query('UPDATE leads SET external_metadata = JSON_MERGE_PATCH(COALESCE(external_metadata, JSON_OBJECT()), ?) WHERE id = ?', [JSON.stringify(c.externalMetadata), existing.id]);
      }
      const junk = contentJunk || ((await isRepeatSubmission(existing.website_id, existing.id, existing.phone_normalized || phoneN, existing.email_normalized || emailN, existing.external_created_at || c.externalCreatedAt, conn)) ? 'repeat' : null);
      await conn.query('UPDATE leads SET junk_reason = ? WHERE id = ?', [junk, existing.id]);
      const sets = ATTR_COLS.map((col) => `${col} = COALESCE(${col}, ?)`).join(', ');
      await conn.query(
        `INSERT INTO lead_attributions (lead_id, ${ATTR_COLS.join(', ')}, extra) VALUES (?, ${ATTR_COLS.map(() => '?').join(', ')}, ?)
         ON DUPLICATE KEY UPDATE ${sets}, extra = JSON_MERGE_PATCH(COALESCE(extra, JSON_OBJECT()), VALUES(extra))`,
        [existing.id, ...ATTR_COLS.map((k) => attr[k] ?? null), JSON.stringify(attr.extra || {}), ...ATTR_COLS.map((k) => attr[k] ?? null)],
      );
      const via = sourceType === LEAD_SOURCE_TYPES.WEBSITE ? 'integration' : sourceType.toLowerCase();
      await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_SYNCED', ?)", [existing.id, JSON.stringify({ via })]);
      const matchedBy = sourceLeadId && existing.source_lead_id === sourceLeadId ? 'source_lead_id' : 'external_id';
      return { leadId: existing.id, created: false, externalLeadId: existing.external_lead_id, junk, matchedBy };
    }

    let status = null;
    if (c.initialStatusCode) [[status]] = await conn.query('SELECT id FROM lead_statuses WHERE code = ? AND is_active = 1', [c.initialStatusCode]);
    if (!status) [[status]] = await conn.query('SELECT id FROM lead_statuses WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order LIMIT 1');
    const junk = contentJunk || ((await isRepeatSubmission(website.id, null, phoneN, emailN, c.externalCreatedAt, conn)) ? 'repeat' : null);
    const sourceId = await sourceIdFor(derived.source, conn);
    const pick = junk ? { userId: null, reason: null } : await pickAssignee({ websiteId: website.id, teamId: assignment?.teamId || null, mode: autoAssign }, conn);
    const assignee = pick.userId;
    const [ins] = await conn.query(
      `INSERT INTO leads (website_id, external_lead_id, external_raw_id, name, phone, phone_normalized, email, email_normalized,
         location, interest, message, form_type, status_id, source_id, source_type, source_lead_id, assigned_user_id, extra, raw_payload,
         external_created_at, junk_reason, external_metadata, ${AD_COLS.map(([col]) => col).join(', ')})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${AD_COLS.map(() => '?').join(', ')})`,
      [website.id, externalLeadId, c.externalRawId, c.name, c.phone, phoneN, c.email, emailN, c.location, c.interest, c.message,
        c.formType, status.id, sourceId, sourceType, sourceLeadId, assignee, JSON.stringify(c.extra || {}), JSON.stringify(c.raw || {}),
        c.externalCreatedAt, junk, c.externalMetadata ? JSON.stringify(c.externalMetadata) : null, ...AD_COLS.map(([, k]) => adVal(c, k))],
    );
    const leadId = ins.insertId;
    await conn.query(
      `INSERT INTO lead_attributions (lead_id, ${ATTR_COLS.join(', ')}, extra) VALUES (?, ${ATTR_COLS.map(() => '?').join(', ')}, ?)`,
      [leadId, ...ATTR_COLS.map((k) => attr[k] ?? null), JSON.stringify(attr.extra || {})],
    );
    await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_CREATED', ?)", [leadId, JSON.stringify({ website: website.code, externalLeadId, source: derived.source })]);
    if (c.receivedActivity?.type) {
      await conn.query('INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, ?, ?)', [leadId, c.receivedActivity.type, JSON.stringify(c.receivedActivity.meta || {})]);
    }
    if (assignee) {
      await conn.query('INSERT INTO lead_assignments (lead_id, assigned_user_id, team_id, reason) VALUES (?, ?, ?, ?)', [leadId, assignee, assignment?.teamId || null, pick.reason]);
      await conn.query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'LEAD_ASSIGNED', ?)", [leadId, JSON.stringify({ to: assignee, auto: true })]);
    }
    const duplicates = await flagDuplicates({ id: leadId, website_id: website.id, phone_normalized: phoneN, email_normalized: emailN }, conn);
    return { leadId, created: true, externalLeadId, assignee, duplicates, junk, matchedBy: null };
  });

  const fresh = !c.externalCreatedAt || Date.now() - new Date(c.externalCreatedAt).getTime() < 24 * 3600_000;
  const isCareer = result.junk === 'career';
  if (result.created && (!silent || fresh) && (!result.junk || isCareer)) {
    await audit('LEAD_CREATED', { entityType: 'lead', entityId: result.leadId, meta: { website: website.code, externalLeadId, via: 'integration', sourceType } });
    if (!isCareer) await scheduleForNewLead(result.leadId); // AI calling agent (no-op when switched off)
    const kind = isCareer ? 'career application' : 'lead';
    // Source-specific wording (e.g. "New Meta lead · Eldeco Group") is sent with the live event too, so the
    // on-screen popup matches the notification instead of a generic "New MPF lead".
    const title = c.notify?.title || `New ${website.code} ${kind}`;
    const body = c.notify?.body || `${c.name || 'Unnamed'}${c.interest ? ` · ${c.interest}` : ''}`;
    const summary = { id: result.leadId, externalLeadId, website: website.code, name: c.name, interest: c.interest, kind, sourceType, title, body };
    if (!isCareer) emitToWebsite(website.id, EVENTS.NEW_LEAD, summary);
    const watchers = await userRepo.usersWithPermission('lead.assign', website.id);
    if (isCareer) {
      const allowed = new Set((await userRepo.usersWithPermission('career.view', website.id)).map((w) => w.id));
      watchers.splice(0, watchers.length, ...watchers.filter((w) => allowed.has(w.id)));
    }
    await notificationService.notifyMany(watchers.map((w) => w.id).filter((id) => id !== result.assignee), {
      type: 'NEW_LEAD', title, body, link: `/crm/leads/${result.leadId}`, data: { leadId: result.leadId, sourceType },
    });
    if (result.assignee) {
      await audit('LEAD_ASSIGNED', { entityType: 'lead', entityId: result.leadId, meta: { to: result.assignee, auto: true } });
      emitToUser(result.assignee, EVENTS.LEAD_ASSIGNED, summary);
      await notificationService.notify(result.assignee, {
        type: 'LEAD_ASSIGNED',
        title: c.notify?.title ? `${c.notify.title} · assigned to you` : 'New lead assigned to you',
        body: c.notify?.body || `${c.name || 'Unnamed'} (${website.code})`,
        link: `/crm/leads/${result.leadId}`, data: { leadId: result.leadId, sourceType },
      });
    }
  } else if (env.AI_CALL_TEST_MODE && !isCareer && (result.created || !silent)) {
    // TESTING: junk / internal / repeat / re-submitted leads still get an AI call.
    await scheduleForNewLead(result.leadId);
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
