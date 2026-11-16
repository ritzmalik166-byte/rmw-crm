/**
 * Meta lead retrieval and normalisation. A leadgen id (from the webhook or a sync) is fetched from the Graph API with
 * the Page token, converted to the canonical CRM lead, and handed to the shared Lead Processor (upsertCanonicalLead).
 */
import { query, one } from '../../config/db.js';
import { clean } from '../../utils/normalize.js';
import { badRequest } from '../../utils/errors.js';
import { upsertCanonicalLead } from '../../services/leadIngestService.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { LEAD_SOURCE_TYPES } from '../../config/leadSources.js';
import { graph } from './metaApi.service.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { metaAuth } from './metaAuth.service.js';
import { PROVIDER } from './meta.config.js';

export const LEAD_FIELDS_FULL = 'id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic,partner_name';
export const LEAD_FIELDS_BASIC = 'id,created_time,field_data,ad_id,form_id,platform,is_organic';

const MAX_FIELDS = 100;
const MAX_VALUE_LEN = 1000;
const STANDARD = new Set(['full_name', 'first_name', 'last_name', 'email', 'work_email', 'phone_number', 'work_phone_number', 'city', 'state',
  'province', 'country', 'zip_code', 'post_code', 'street_address', 'company_name', 'job_title', 'date_of_birth', 'gender', 'marital_status']);

// Custom questions differ per form; these patterns pick out the ones the sales team cares about.
const REQUIREMENT = /(requirement|bhk|configuration|property_?type|looking_?for|unit_?type|interested_?in|which_?(property|project|unit)|product|service)/i;
const BUDGET = /(budget|price|range|investment)/i;
const LOCATION = /(location|locality|preferred_?(area|city|location)|sector|area|city)/i;

/** Strip control characters and cap length. Meta values are user input. */
export function sanitizeValue(v) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_LEN);
}

export function sanitizeKey(k) {
  return String(k ?? '').toLowerCase().replace(/[^a-z0-9_?]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'field';
}

/** "what_is_your_budget?" -> "What is your budget?" */
export function humanizeKey(k) {
  const s = String(k).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : k;
}

/** field_data -> ordered [{ key, label, value }] (multi-select answers joined). */
export function parseFieldData(fieldData) {
  if (!Array.isArray(fieldData)) return [];
  const out = [];
  const seen = new Set();
  for (const f of fieldData.slice(0, MAX_FIELDS)) {
    if (!f || typeof f !== 'object') continue;
    const key = sanitizeKey(f.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const values = (Array.isArray(f.values) ? f.values : [f.values]).map(sanitizeValue).filter(Boolean);
    out.push({ key, label: humanizeKey(key), value: values.join(', ') });
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Convert a Graph API Lead object to the canonical CRM lead. Pure (no I/O) so it is unit-tested.
 * ctx: { pageId, formName, instagramAccountId }
 */
export function normalizeMetaLead(lead, ctx = {}) {
  if (!lead || !/^\d{1,32}$/.test(String(lead.id || ''))) throw badRequest('Meta lead is missing a valid id', 'META_INVALID_LEAD');
  const responses = parseFieldData(lead.field_data);
  const get = (...keys) => responses.find((r) => keys.includes(r.key) && r.value)?.value || null;
  const custom = responses.filter((r) => !STANDARD.has(r.key) && r.value);
  const pick = (re) => custom.find((r) => re.test(r.key))?.value || null;

  const name = get('full_name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ') || null;
  const phone = get('phone_number', 'work_phone_number');
  const rawEmail = get('email', 'work_email');
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail.toLowerCase() : null;
  const requirement = pick(REQUIREMENT);
  const budget = pick(BUDGET);
  const location = pick(LOCATION) || [get('city'), get('state', 'province')].filter(Boolean).join(', ') || null;
  const platform = lead.platform === 'ig' ? 'instagram' : lead.platform === 'fb' ? 'facebook' : (lead.platform || null);
  const isOrganic = Boolean(lead.is_organic);

  const formResponses = Object.fromEntries(responses.map((r) => [r.key, r.value]));
  const message = custom.length ? custom.map((r) => `${r.label}: ${r.value}`).join('\n').slice(0, 20000) : null;
  const campaignName = clean(lead.campaign_name);
  const created = lead.created_time ? new Date(lead.created_time) : null;

  return {
    externalRawId: `META-${lead.id}`,
    externalLeadId: `META-${lead.id}`, // no website prefix: Meta leads are identified by their Meta id
    sourceType: LEAD_SOURCE_TYPES.META,
    sourceLeadId: String(lead.id),
    name: clean(name, 150),
    phone: clean(phone, 40),
    email: clean(email, 190),
    location: clean(location),
    interest: clean(requirement || ctx.formName),
    message,
    formType: 'meta_lead_ad',
    externalCreatedAt: created && !Number.isNaN(created.getTime()) ? created : null,
    attribution: { extra: { platform, is_organic: isOrganic, rawEmailRejected: rawEmail && !email ? true : undefined } },
    attributionOverride: {
      source: platform || 'facebook',
      medium: isOrganic ? 'organic_social' : 'paid_social',
      campaign: campaignName,
      term: clean(lead.adset_name),
      content: clean(lead.ad_name),
    },
    ad: {
      campaignId: lead.campaign_id ? String(lead.campaign_id) : null,
      campaignName,
      adSetId: lead.adset_id ? String(lead.adset_id) : null,
      adSetName: clean(lead.adset_name),
      adId: lead.ad_id ? String(lead.ad_id) : null,
      adName: clean(lead.ad_name),
      formId: lead.form_id ? String(lead.form_id) : null,
      formName: clean(ctx.formName),
      pageId: ctx.pageId ? String(ctx.pageId) : null,
      instagramAccountId: platform === 'instagram' && ctx.instagramAccountId ? String(ctx.instagramAccountId) : null,
    },
    externalMetadata: {
      provider: 'META',
      formResponses,
      responseOrder: responses.map((r) => ({ key: r.key, label: r.label })),
      requirement, budget, platform, isOrganic,
      partnerName: clean(lead.partner_name),
    },
    extra: { requirement, budget, platform },
    receivedActivity: { type: 'META_LEAD_RECEIVED', meta: { platform, campaign: campaignName, form: clean(ctx.formName), ad: clean(lead.ad_name) } },
    notify: {
      title: 'New Meta Lead Received',
      body: [name || 'Unnamed', [requirement, location].filter(Boolean).join(' - '), campaignName && `Campaign: ${campaignName}`].filter(Boolean).join(' · ').slice(0, 1000),
    },
  };
}

/** Fetch one lead. Falls back to basic fields when the token lacks ads_read (campaign/ad names). */
export async function fetchLead(leadgenId, pageToken) {
  try {
    return await graph(String(leadgenId), { token: pageToken, params: { fields: LEAD_FIELDS_FULL } });
  } catch (err) {
    if (err.isPermissionError || err.errorCode === 'META_INVALID_REQUEST') {
      return graph(String(leadgenId), { token: pageToken, params: { fields: LEAD_FIELDS_BASIC } });
    }
    throw err;
  }
}

/** Form name from the local cache, else from Meta (then cached). */
async function formName(connectionId, pageId, formId, pageToken) {
  if (!formId) return null;
  const cached = await one('SELECT name FROM meta_forms WHERE form_id = ?', [String(formId)]);
  if (cached?.name) return cached.name;
  try {
    const f = await graph(String(formId), { token: pageToken, params: { fields: 'id,name,status' } });
    await query(
      `INSERT INTO meta_forms (connection_id, page_id, form_id, name, status, last_synced_at) VALUES (?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status), last_synced_at = NOW(3)`,
      [connectionId, String(pageId), String(formId), f?.name?.slice(0, 255) || null, f?.status || null],
    );
    return f?.name || null;
  } catch {
    return null;
  }
}

/**
 * Import one Meta lead object for a connected Page. Shared by the webhook worker and manual sync.
 * Returns the Lead Processor result.
 */
export async function importMetaLead(page, lead, { silent = false } = {}) {
  const website = await one('SELECT id, code, domain, external_id_prefix FROM websites WHERE id = ?', [page.website_id]);
  if (!website) throw badRequest('Choose the CRM website for Meta leads in Integrations > Meta > Manage', 'META_NO_WEBSITE');
  const ig = await one("SELECT external_id FROM meta_assets WHERE connection_id = ? AND asset_type = 'INSTAGRAM' AND parent_external_id = ? AND is_selected = 1", [page.conn_id, page.external_id]);
  const canonical = normalizeMetaLead(lead, {
    pageId: page.external_id,
    formName: await formName(page.conn_id, page.external_id, lead.form_id, page.token),
    instagramAccountId: ig?.external_id || null,
  });
  canonical.raw = { id: lead.id, form_id: lead.form_id || null, ad_id: lead.ad_id || null, created_time: lead.created_time || null, platform: lead.platform || null };
  const res = await upsertCanonicalLead(website, canonical, { silent, assignment: { teamId: page.assignment_team_id || null } });
  if (res.created) await repo.touchLead(page.conn_id);
  return res;
}

/** Worker: process one stored webhook event (retried by BullMQ on transient failures). */
export async function processMetaWebhookEvent(eventId) {
  const event = await one('SELECT * FROM meta_webhook_events WHERE id = ?', [eventId]);
  if (!event || ['PROCESSED', 'DUPLICATE', 'IGNORED'].includes(event.status)) return;
  await query("UPDATE meta_webhook_events SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = ?", [eventId]);

  const page = event.page_id ? await repo.pageWithToken(event.page_id) : null;
  if (!page || page.conn_status === 'DISCONNECTED') {
    await query("UPDATE meta_webhook_events SET status = 'IGNORED', error = ?, processed_at = NOW(3) WHERE id = ?", ['Page is not connected to the CRM', eventId]);
    await integrationLog(PROVIDER, 'warn', 'WEBHOOK_IGNORED', `Lead ${event.leadgen_id} ignored: Page ${event.page_id} is not connected`, { leadgenId: event.leadgen_id, pageId: event.page_id });
    return;
  }
  if (!page.token) {
    const msg = 'No Page token stored. Reconnect Meta.';
    await query("UPDATE meta_webhook_events SET status = 'FAILED', error = ? WHERE id = ?", [msg, eventId]);
    await repo.setError(page.conn_id, 'META_TOKEN_INVALID', msg);
    return;
  }

  try {
    const lead = await fetchLead(event.leadgen_id, page.token);
    const res = await importMetaLead(page, lead);
    await query('UPDATE meta_webhook_events SET status = ?, lead_id = ?, error = NULL, processed_at = NOW(3) WHERE id = ?', [res.created ? 'PROCESSED' : 'DUPLICATE', res.leadId, eventId]);
    if (res.created) {
      await integrationLog(PROVIDER, 'info', 'LEAD_IMPORTED', `Lead ${event.leadgen_id} imported`, { leadgenId: event.leadgen_id, leadId: res.leadId, assigned: Boolean(res.assignee), duplicates: res.duplicates?.length || 0, junk: res.junk || null });
    } else {
      await integrationLog(PROVIDER, 'info', 'DUPLICATE_DETECTED', `Lead ${event.leadgen_id} already exists; existing lead updated`, { leadgenId: event.leadgen_id, leadId: res.leadId, matchedBy: res.matchedBy });
    }
  } catch (err) {
    const msg = String(err.message).slice(0, 1000);
    await query("UPDATE meta_webhook_events SET status = 'FAILED', error = ? WHERE id = ?", [msg, eventId]);
    const conn = await repo.byId(page.conn_id);
    if (err.name === 'MetaApiError') await metaAuth.recordApiError(conn, err, `Fetching lead ${event.leadgen_id}`);
    else await integrationLog(PROVIDER, 'error', 'LEAD_FAILED', `Lead ${event.leadgen_id} failed: ${msg}`, { leadgenId: event.leadgen_id });
    if (err.isTransient || !err.expose) throw err; // let the queue retry with backoff
  }
}
