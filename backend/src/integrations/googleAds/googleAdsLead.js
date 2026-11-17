/**
 * Google Ads lead form webhook payload -> canonical CRM lead. Pure (no I/O) so it is unit-tested.
 *
 * Google sends (api_version 1.0):
 * { lead_id, api_version, form_id, campaign_id, adgroup_id, creative_id, gcl_id, google_key, is_test,
 *   lead_submit_time?, asset_id?, user_column_data: [{ column_id, column_name, string_value }] }
 * Standard column_ids: FULL_NAME, FIRST_NAME, LAST_NAME, EMAIL, WORK_EMAIL, PHONE_NUMBER, WORK_PHONE, CITY, REGION,
 * COUNTRY, POSTAL_CODE, STREET_ADDRESS, COMPANY_NAME, JOB_TITLE. Custom questions carry their own id/name.
 */
import { clean } from '../../utils/normalize.js';
import { badRequest } from '../../utils/errors.js';
import { LEAD_SOURCE_TYPES } from '../../config/leadSources.js';

const MAX_FIELDS = 100;
const MAX_VALUE_LEN = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GOOGLE_ID = /^[A-Za-z0-9_\-.:]{1,190}$/;
const NUM_ID = /^\d{1,32}$/;

const STANDARD = new Set(['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'EMAIL', 'WORK_EMAIL', 'PHONE_NUMBER', 'WORK_PHONE', 'CITY', 'REGION',
  'COUNTRY', 'POSTAL_CODE', 'STREET_ADDRESS', 'COMPANY_NAME', 'JOB_TITLE']);

const REQUIREMENT = /(requirement|bhk|configuration|property.?type|looking.?for|unit.?type|interested.?in|which.?(property|project|unit)|product|service)/i;
const BUDGET = /(budget|price|range|investment)/i;
const LOCATION = /(location|locality|preferred.?(area|city|location)|sector|area)/i;

export function sanitizeValue(v) {
  return String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_VALUE_LEN);
}

const optId = (v, re = NUM_ID) => (v != null && re.test(String(v)) ? String(v) : null);

/** user_column_data -> [{ id, label, value }] (standard ids upper-cased; custom keep their label). */
export function parseColumns(cols) {
  if (!Array.isArray(cols)) return [];
  const out = [];
  const seen = new Set();
  for (const c of cols.slice(0, MAX_FIELDS)) {
    if (!c || typeof c !== 'object') continue;
    const rawId = sanitizeValue(c.column_id || c.column_name).slice(0, 100);
    if (!rawId) continue;
    const id = STANDARD.has(rawId.toUpperCase()) ? rawId.toUpperCase() : rawId;
    if (seen.has(id)) continue;
    seen.add(id);
    const label = sanitizeValue(c.column_name || rawId).slice(0, 200) || id;
    out.push({ id, label, value: sanitizeValue(c.string_value) });
  }
  return out;
}

export function normalizeGoogleAdsLead(body) {
  if (!body || typeof body !== 'object') throw badRequest('Empty Google Ads payload', 'GOOGLE_ADS_INVALID_LEAD');
  const leadId = String(body.lead_id ?? '').trim();
  if (!GOOGLE_ID.test(leadId)) throw badRequest('Google Ads payload is missing a valid lead_id', 'GOOGLE_ADS_INVALID_LEAD');

  const cols = parseColumns(body.user_column_data);
  const get = (...ids) => cols.find((c) => ids.includes(c.id) && c.value)?.value || null;
  const custom = cols.filter((c) => !STANDARD.has(c.id) && c.value);
  const pick = (re) => custom.find((c) => re.test(c.id) || re.test(c.label))?.value || null;

  const name = get('FULL_NAME') || [get('FIRST_NAME'), get('LAST_NAME')].filter(Boolean).join(' ') || null;
  const phone = get('PHONE_NUMBER', 'WORK_PHONE');
  const rawEmail = get('EMAIL', 'WORK_EMAIL');
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail.toLowerCase() : null;
  const requirement = pick(REQUIREMENT);
  const budget = pick(BUDGET);
  const location = pick(LOCATION) || [get('CITY'), get('REGION')].filter(Boolean).join(', ') || null;
  const isTest = body.is_test === true || body.is_test === 'true';
  const gclid = clean(sanitizeValue(body.gcl_id), 255);
  const campaignId = optId(body.campaign_id);
  const adgroupId = optId(body.adgroup_id);
  const creativeId = optId(body.creative_id);
  const formId = optId(body.form_id);
  const submitted = body.lead_submit_time ? new Date(body.lead_submit_time) : null;

  const message = custom.length ? custom.map((c) => `${c.label}: ${c.value}`).join('\n').slice(0, 20000) : null;

  return {
    externalRawId: `GADS-${leadId}`,
    externalLeadId: `GADS-${leadId}`.slice(0, 100),
    sourceType: LEAD_SOURCE_TYPES.GOOGLE_ADS,
    sourceLeadId: leadId.slice(0, 100),
    name: clean(name, 150),
    phone: clean(phone, 40),
    email: clean(email, 190),
    location: clean(location),
    interest: clean(requirement),
    message,
    formType: 'google_ads_lead_form',
    externalCreatedAt: submitted && !Number.isNaN(submitted.getTime()) ? submitted : null,
    forceJunk: isTest ? 'test' : null,
    attribution: { gclid, extra: { is_test: isTest || undefined, rawEmailRejected: rawEmail && !email ? true : undefined } },
    attributionOverride: { source: 'google', medium: 'cpc', campaign: campaignId, term: adgroupId, content: creativeId },
    ad: { campaignId, adSetId: adgroupId, adId: creativeId, formId },
    externalMetadata: {
      provider: 'GOOGLE_ADS',
      formResponses: Object.fromEntries(cols.map((c) => [c.id, c.value])),
      responseOrder: cols.map((c) => ({ key: c.id, label: c.label })),
      requirement, budget, isTest, gclid,
      assetId: optId(body.asset_id),
      apiVersion: clean(sanitizeValue(body.api_version), 20),
    },
    extra: { requirement, budget },
    receivedActivity: { type: 'GOOGLE_ADS_LEAD_RECEIVED', meta: { campaignId, formId, isTest } },
    notify: {
      title: 'New Google Ads Lead Received',
      body: [name || 'Unnamed', [requirement, location].filter(Boolean).join(' - ')].filter(Boolean).join(' · ').slice(0, 1000),
    },
    raw: { lead_id: leadId, form_id: formId, campaign_id: campaignId, adgroup_id: adgroupId, creative_id: creativeId, is_test: isTest },
  };
}
