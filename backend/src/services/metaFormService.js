/**
 * Client Meta lead forms WITHOUT Page access.
 *
 * Meta only releases lead data to a token with access to the Page that owns the form, so a form id alone cannot pull
 * leads. Instead the client registers the form here (the "Campaign Detail + Fields Level Mapping" sheet) and gets a
 * per-form push URL. Their own middleware (Zapier / Make / Pabbly / LeadsBridge / their server), which already has
 * access to their Page, forwards each lead to it:
 *
 *   POST {API}/api/public/meta-form-leads/{api_key}      JSON, form-urlencoded or ?query; one lead or an array (max 100)
 *
 * Accepted shapes: Meta Graph lead ({ id, created_time, field_data: [{ name, values }], ad_name, adset_name, ... }),
 * flat middleware JSON ({ "Full Name": .., "Phone Number": .., "Ad Name": .. }), or a row of Meta's CSV export
 * (values prefixed l: / p: / ag: ...). Keys are normalised to snake_case, then the registration's field map turns them
 * into CRM fields. Leads are deduplicated on the Meta lead id, so middleware retries and CSV re-imports are safe.
 *
 * Meta "Lead Ads Testing Tool" leads (values like "<test lead: dummy data for full_name>") are not stored: they only
 * teach the CRM which fields the form sends, so the mapping screen can offer them.
 */
import { env } from '../config/env.js';
import { query, one } from '../config/db.js';
import { clean } from '../utils/normalize.js';
import { randomToken } from '../utils/crypto.js';
import { badRequest, unauthorized, notFound, conflict, AppError } from '../utils/errors.js';
import { upsertCanonicalLead } from './leadIngestService.js';
import { audit } from './auditService.js';
import { LEAD_SOURCE_TYPES } from '../config/leadSources.js';
import { sanitizeKey, sanitizeValue, humanizeKey, parseFieldData } from '../integrations/meta/metaLead.service.js';

const KEY_RE = /^mf_[A-Za-z0-9_-]{20,60}$/;
const META_ID = /^\d{5,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_KEYS = 120;
const MAX_DETECTED = 150;
export const MAX_BATCH = 100;
export const MAX_IMPORT_ROWS = 150; // per request: /api parses JSON up to 200kb, the browser sends the CSV in chunks

/**
 * CRM fields a form can be mapped to. `sfdc` mirrors the client's Salesforce sheet so the mapping screen reads the
 * same as the document they fill in. `aliases` are payload keys tried, in order, by auto-mapping.
 */
export const TARGETS = Object.freeze([
  { key: 'first_name', label: 'First name', sfdc: 'FirstName', aliases: ['first_name', 'firstname', 'fname', 'given_name'] },
  { key: 'last_name', label: 'Last name', sfdc: 'LastName', aliases: ['last_name', 'lastname', 'lname', 'surname', 'family_name'] },
  { key: 'full_name', label: 'Full name', sfdc: null, aliases: ['full_name', 'fullname', 'name', 'your_name', 'customer_name'] },
  { key: 'salutation', label: 'Salutation', sfdc: 'Salutation', aliases: ['salutation', 'title', 'prefix'] },
  { key: 'phone', label: 'Mobile phone', sfdc: 'PersonMobilePhone', aliases: ['phone_number', 'phone', 'mobile', 'mobile_number', 'work_phone_number', 'contact_number', 'whatsapp_number'] },
  { key: 'email', label: 'Email', sfdc: 'Email__c', aliases: ['email', 'email_address', 'work_email', 'e_mail'] },
  { key: 'city', label: 'City', sfdc: 'City__c', aliases: ['city', 'your_city', 'location', 'current_city', 'preferred_location'] },
  { key: 'enquiry_source', label: 'Enquiry source', sfdc: 'Enquiry_Source__c', aliases: [], fallback: 'const:Digital' },
  { key: 'enquiry_sub_source', label: 'Enquiry sub source', sfdc: 'Enquiry_Sub_Source__c', aliases: [], fallback: 'const:Facebook' },
  { key: 'project', label: 'Project', sfdc: 'Project__c', aliases: [] }, // default: const:<registration project>
  { key: 'utm_source', label: 'UTM source', sfdc: 'UTM_Source__c', aliases: ['utm_source', 'platform'], fallback: 'const:facebook' },
  { key: 'utm_medium', label: 'UTM medium', sfdc: 'UTM_medium__c', aliases: ['utm_medium'], fallback: 'const:paid_social' },
  { key: 'utm_campaign', label: 'UTM campaign', sfdc: 'UTM_Campaign__c', aliases: ['utm_campaign', 'campaign_name', 'campaign'] },
  { key: 'utm_term', label: 'UTM term', sfdc: null, aliases: ['utm_term', 'adset_name', 'ad_set_name', 'adset'] },
  { key: 'utm_content', label: 'UTM content', sfdc: 'UTM_Content__c', aliases: ['utm_content', 'ad_name', 'ad'] },
  { key: 'google_id', label: 'Google id (gclid)', sfdc: 'Google_Id__c', aliases: ['gclid', 'google_id'] },
  { key: 'budget', label: 'Budget', sfdc: null, aliases: [] },
  { key: 'requirement', label: 'Requirement / configuration', sfdc: null, aliases: [] },
  { key: 'remarks', label: 'Remarks', sfdc: null, aliases: ['remarks', 'message', 'comments', 'notes'] },
]);
const TARGET_KEYS = new Set(TARGETS.map((t) => t.key));

/** Lead attributes every Meta middleware sends; shown in the mapping dropdowns before the first lead arrives. */
export const META_ATTRIBUTES = Object.freeze(['id', 'created_time', 'form_id', 'form_name', 'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
  'ad_id', 'ad_name', 'platform', 'is_organic', 'page_id']);
const META_ATTR_SET = new Set([...META_ATTRIBUTES, 'leadgen_id', 'lead_id', 'ad_set_id', 'ad_set_name', 'page_name', 'retailer_item_id', 'partner_name', 'test', 'is_test']);
const STANDARD_QUESTIONS = ['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'city'];

// Custom questions that usually carry budget / requirement (same idea as the direct Meta connector).
const BUDGET_RE = /(budget|price|range|investment)/i;
const REQUIREMENT_RE = /(requirement|bhk|configuration|property_?type|looking_?for|unit_?type|interested_?in|size)/i;

// Meta's CSV export prefixes ids and phones: l:<lead> ag:<ad> as:<adset> c:<campaign> f:<form> p:<phone>.
const EXPORT_PREFIX = { id: /^l:/, ad_id: /^ag:/, adset_id: /^as:/, campaign_id: /^c:/, form_id: /^f:/ };
const SECRET_KEYS = new Set(['api_key', 'apikey', 'key', 'access_token', 'token']);

const isTestValue = (v) => /^<\s*test lead/i.test(String(v || ''));

/**
 * Any supported payload -> flat { snake_key: string }. Pure; exported for tests.
 * Form answers (field_data) win over top-level keys of the same name.
 */
export function flattenLeadPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Send the lead as a JSON object', 'META_FORM_PAYLOAD');
  if (Array.isArray(input.entry) && input.object === 'page') {
    throw badRequest('This is a raw Meta webhook (it only carries a leadgen id, no answers). Send the lead details instead: in your middleware use the "New Lead" trigger and forward its fields.', 'META_FORM_RAW_WEBHOOK');
  }
  const src = input.lead && typeof input.lead === 'object' && !Array.isArray(input.lead) ? { ...input, ...input.lead } : input;
  const out = {};
  const put = (k, v) => {
    if (Object.keys(out).length >= MAX_KEYS) return;
    const key = sanitizeKey(k);
    if (SECRET_KEYS.has(key)) return;
    const val = Array.isArray(v) ? v.filter((x) => x == null || typeof x !== 'object').map(sanitizeValue).filter(Boolean).join(', ') : sanitizeValue(v);
    if (val !== '' && !(key in out)) out[key] = val;
  };
  // 1. form answers
  for (const r of parseFieldData(src.field_data)) if (r.value) out[r.key] = r.value;
  // 2. top level (one level of nested objects, e.g. { ad: { name } } -> ad_name)
  for (const [k, v] of Object.entries(src)) {
    if (k === 'field_data' || k === 'lead') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) if (v2 == null || typeof v2 !== 'object') put(`${k}_${k2}`, v2);
    } else put(k, v);
  }
  // 3. Meta CSV export prefixes
  for (const [k, re] of Object.entries(EXPORT_PREFIX)) if (out[k]) out[k] = out[k].replace(re, '');
  for (const k of Object.keys(out)) if (/phone/.test(k)) out[k] = out[k].replace(/^p:/, '');
  if (!out.id && (out.leadgen_id || out.lead_id)) out.id = out.leadgen_id || out.lead_id;
  return out;
}

/** True for leads created by Meta's Lead Ads Testing Tool (or flagged test by the sender). */
export function isTestLead(flat) {
  return flat.is_test === 'true' || flat.test === 'true' || Object.values(flat).some(isTestValue);
}

/** Best default mapping for the keys seen so far (or the standard Meta keys before any lead). Pure. */
export function autoMap(detectedKeys = [], projectName = null) {
  const keys = new Set(detectedKeys.length ? detectedKeys : [...STANDARD_QUESTIONS, ...META_ATTRIBUTES]);
  const custom = [...keys].filter((k) => !META_ATTR_SET.has(k) && !STANDARD_QUESTIONS.includes(k));
  const map = {};
  for (const t of TARGETS) {
    const hit = t.aliases.find((a) => keys.has(a));
    if (hit) map[t.key] = `field:${hit}`;
    else if (t.fallback) map[t.key] = t.fallback;
  }
  if (map.full_name && map.first_name) delete map.full_name; // form asks first + last; full_name stays a fallback
  const budget = custom.find((k) => BUDGET_RE.test(k));
  const requirement = custom.find((k) => REQUIREMENT_RE.test(k));
  if (budget) map.budget = `field:${budget}`;
  if (requirement) map.requirement = `field:${requirement}`;
  if (projectName) map.project = `const:${projectName}`;
  return map;
}

/** Keep only known targets and well-formed sources. Pure. */
export function sanitizeFieldMap(map) {
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [k, v] of Object.entries(map)) {
    if (!TARGET_KEYS.has(k) || typeof v !== 'string') continue;
    const m = /^(field|const):(.{1,255})$/s.exec(v.trim());
    if (!m) continue;
    out[k] = m[1] === 'field' ? `field:${sanitizeKey(m[2])}` : `const:${sanitizeValue(m[2]).slice(0, 255)}`;
  }
  return out;
}

/** field map + flat payload -> { crmField: value }. Pure. */
export function applyMapping(map, flat) {
  const out = {};
  for (const t of TARGETS) {
    const src = map?.[t.key];
    if (!src) continue;
    const v = src.startsWith('field:') ? flat[src.slice(6)] : src.startsWith('const:') ? src.slice(6) : null;
    if (v != null && String(v).trim() !== '') out[t.key] = String(v).trim();
  }
  return out;
}

const parseDate = (v) => {
  if (!v) return null;
  const d = new Date(/^\d{10}$/.test(v) ? Number(v) * 1000 : v);
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 86_400_000 ? null : d;
};

/** Registration + flat payload -> canonical CRM lead (no I/O). Exported for tests. */
export function buildCanonical(reg, flat) {
  const map = typeof reg.field_map === 'string' ? JSON.parse(reg.field_map) : (reg.field_map || autoMap([], reg.project_name));
  const m = applyMapping(map, flat);
  const name = m.full_name || [m.first_name, m.last_name].filter(Boolean).join(' ') || null;
  const rawEmail = m.email || null;
  const email = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail.toLowerCase() : null;
  const phone = m.phone ? m.phone.replace(/[^\d+]/g, '').slice(0, 20) || null : null;
  const project = m.project || reg.project_name || null;
  const leadId = META_ID.test(flat.id || '') ? flat.id : null;
  const platform = /^(ig|instagram)$/i.test(flat.platform || '') ? 'instagram' : /^(fb|facebook)$/i.test(flat.platform || '') ? 'facebook' : null;

  // Answers no CRM field took go into the note, labelled, so nothing the customer typed is lost.
  const usedKeys = new Set(Object.values(map || {}).filter((s) => s.startsWith('field:')).map((s) => s.slice(6)));
  const unmapped = Object.entries(flat).filter(([k]) => !usedKeys.has(k) && !META_ATTR_SET.has(k));
  const message = [m.remarks, ...unmapped.map(([k, v]) => `${humanizeKey(k)}: ${v}`)].filter(Boolean).join('\n').slice(0, 5000) || null;
  const sfdc = Object.fromEntries(TARGETS.filter((t) => t.sfdc && m[t.key]).map((t) => [t.sfdc, m[t.key]]));
  if (project) sfdc.Project__c = project;

  return {
    externalRawId: leadId ? `MF-${leadId}` : `MF${reg.id}-${Date.now().toString(36)}${randomToken(4).replace(/[^A-Za-z0-9]/g, '').slice(0, 5)}`.toUpperCase(),
    sourceType: LEAD_SOURCE_TYPES.META_FORM,
    sourceLeadId: leadId,
    name: clean(name, 150),
    phone,
    email: clean(email, 190),
    location: clean(m.city),
    interest: clean(project),
    message,
    formType: 'meta_lead_form',
    externalCreatedAt: parseDate(flat.created_time) || new Date(),
    attribution: {
      utm_source: clean(m.utm_source), utm_medium: clean(m.utm_medium), utm_campaign: clean(m.utm_campaign),
      utm_term: clean(m.utm_term), utm_content: clean(m.utm_content), gclid: clean(m.google_id), page_name: clean(reg.form_name),
      extra: { client: reg.client_name, platform, is_organic: flat.is_organic === 'true' || flat.is_organic === '1' || undefined, rawEmailRejected: rawEmail && !email ? true : undefined },
    },
    attributionOverride: {
      source: clean(m.utm_source) || platform || 'facebook', medium: clean(m.utm_medium) || 'paid_social',
      campaign: clean(m.utm_campaign), term: clean(m.utm_term), content: clean(m.utm_content),
    },
    ad: {
      campaignId: META_ID.test(flat.campaign_id || '') ? flat.campaign_id : null, campaignName: clean(flat.campaign_name),
      adSetId: META_ID.test(flat.adset_id || flat.ad_set_id || '') ? (flat.adset_id || flat.ad_set_id) : null, adSetName: clean(flat.adset_name || flat.ad_set_name),
      adId: META_ID.test(flat.ad_id || '') ? flat.ad_id : null, adName: clean(flat.ad_name),
      formId: reg.form_id, formName: clean(reg.client_name, 255), // client name: groups the lead in the Client Leads tab
      pageId: META_ID.test(flat.page_id || '') ? flat.page_id : null,
    },
    extra: {
      salutation: m.salutation || null, enquirySource: m.enquiry_source || null, enquirySubSource: m.enquiry_sub_source || null,
      budget: m.budget || null, requirement: m.requirement || null, googleId: m.google_id || null, platform, metaFormName: reg.form_name,
    },
    externalMetadata: {
      provider: 'META_FORM', registrationId: reg.id, formId: reg.form_id, formName: reg.form_name, campaignType: reg.campaign_type,
      formResponses: flat, mapped: m, sfdc,
    },
    receivedActivity: { type: 'META_LEAD_RECEIVED', meta: { platform, campaign: clean(flat.campaign_name), form: clean(reg.form_name), ad: clean(flat.ad_name), via: 'client_middleware' } },
    notify: {
      title: `New Meta lead · ${reg.client_name}`,
      body: [name || 'Unnamed', project, flat.ad_name && `Ad: ${flat.ad_name}`].filter(Boolean).join(' · ').slice(0, 1000),
    },
  };
}

const parseJson = (v, d) => { if (v == null) return d; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return d; } };
const newKey = () => `mf_${randomToken(24).replace(/[^A-Za-z0-9_-]/g, '')}`;

export function pushEndpoint(apiKey = '{api_key}') {
  const base = (env.PUBLIC_API_URL || env.APP_URL).replace(/\/$/, '');
  return `${base}/api/public/meta-form-leads/${apiKey}`;
}

async function rememberFields(reg, flat) {
  const known = parseJson(reg.detected_fields, []);
  const add = Object.keys(flat).filter((k) => !known.includes(k));
  if (!add.length) return known;
  const next = [...known, ...add].slice(0, MAX_DETECTED);
  await query('UPDATE meta_form_registrations SET detected_fields = ? WHERE id = ?', [JSON.stringify(next), reg.id]);
  reg.detected_fields = next;
  return next;
}

async function fail(reg, msg) {
  await query('UPDATE meta_form_registrations SET last_error = ?, last_error_at = NOW(3) WHERE id = ?', [String(msg).slice(0, 500), reg.id]);
}

/** One flat lead through the registration. Returns a per-lead result (never throws for data problems). */
async function ingestOne(reg, website, raw, { silent = false } = {}) {
  let flat;
  try { flat = flattenLeadPayload(raw); } catch (err) { return { ok: false, error: err.message }; }
  await rememberFields(reg, flat);
  if (flat.form_id && flat.form_id !== reg.form_id) {
    const msg = `Lead is from form ${flat.form_id}, but this URL is for form ${reg.form_id} (${reg.form_name}). Use that form's own URL.`;
    await fail(reg, msg);
    return { ok: false, error: msg };
  }
  if (isTestLead(flat)) {
    await query('UPDATE meta_form_registrations SET last_test_at = NOW(3), last_error = NULL WHERE id = ?', [reg.id]);
    return { ok: true, test: true, fields: Object.keys(flat) };
  }
  const canonical = buildCanonical(reg, flat);
  if (!canonical.phone && !canonical.email) {
    const msg = `Lead ${flat.id || ''} has no phone or email after mapping. Received fields: ${Object.keys(flat).join(', ')}`.slice(0, 500);
    await fail(reg, msg);
    return { ok: false, error: msg };
  }
  canonical.raw = { via: silent ? 'meta_form_import' : 'meta_form_push', registrationId: reg.id, id: flat.id || null };
  const res = await upsertCanonicalLead(website, canonical, { silent, assignment: { teamId: reg.assignment_team_id || null } });
  await query('UPDATE meta_form_registrations SET leads_count = leads_count + ?, last_lead_at = NOW(3), last_error = NULL WHERE id = ?', [res.created ? 1 : 0, reg.id]);
  return { ok: true, created: Boolean(res.created), reference: res.externalLeadId };
}

async function loadForIngest(where, param) {
  const reg = await one(`SELECT * FROM meta_form_registrations WHERE ${where}`, [param]);
  if (!reg) return {};
  const website = await one('SELECT id, code, domain, external_id_prefix FROM websites WHERE id = ?', [reg.website_id]);
  return { reg, website };
}

export const metaFormService = {
  /** Public URL check (GET with no lead fields): confirms the key, creates nothing. */
  async verify(apiKey) {
    if (!apiKey || !KEY_RE.test(apiKey)) throw unauthorized('Invalid form URL', 'META_FORM_KEY');
    const reg = await one('SELECT form_id, form_name, is_active FROM meta_form_registrations WHERE api_key = ?', [apiKey]);
    if (!reg || !reg.is_active) throw unauthorized('Invalid or disabled form URL', 'META_FORM_KEY');
    return { formId: reg.form_id, formName: reg.form_name };
  },

  /** Public push endpoint. body: one lead object or an array of up to MAX_BATCH. */
  async push(apiKey, body) {
    if (!apiKey || !KEY_RE.test(apiKey)) throw unauthorized('Invalid form URL', 'META_FORM_KEY');
    const { reg, website } = await loadForIngest('api_key = ?', apiKey);
    if (!reg || !reg.is_active) throw unauthorized('Invalid or disabled form URL', 'META_FORM_KEY');
    if (!website) throw notFound('Pipeline for this form no longer exists');
    const list = Array.isArray(body) ? body : Array.isArray(body?.leads) ? body.leads : [body];
    if (!list.length) throw badRequest('No lead in the request', 'META_FORM_PAYLOAD');
    if (list.length > MAX_BATCH) throw badRequest(`Send at most ${MAX_BATCH} leads per request`, 'META_FORM_PAYLOAD');
    const results = [];
    for (const raw of list) results.push(await ingestOne(reg, website, raw));
    if (list.length === 1 && !results[0].ok) throw new AppError(results[0].error, { status: 422, errorCode: 'META_FORM_LEAD_REJECTED' });
    return { results, received: list.length, accepted: results.filter((r) => r.ok && !r.test).length, tests: results.filter((r) => r.test).length };
  },

  /** Admin: import rows of Meta's CSV export (parsed in the browser). Silent: no "new lead" push per row. */
  async importRows(req, id, rows) {
    const { reg, website } = await loadForIngest('id = ?', id);
    if (!reg) throw notFound('Form not found');
    if (!website) throw notFound('Pipeline for this form no longer exists');
    const stats = { rows: rows.length, created: 0, updated: 0, tests: 0, skippedOtherForm: 0, failed: 0, errors: [] };
    for (const row of rows) {
      const r = await ingestOne(reg, website, row, { silent: true });
      if (r.test) stats.tests += 1;
      else if (r.ok) stats[r.created ? 'created' : 'updated'] += 1;
      else if (/^Lead is from form/.test(r.error)) stats.skippedOtherForm += 1;
      else { stats.failed += 1; if (stats.errors.length < 5) stats.errors.push(r.error); }
    }
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_form', entityId: id, req, meta: { action: 'import', ...stats, errors: undefined } });
    return stats;
  },

  async list() {
    const rows = await query(
      `SELECT r.*, w.code AS website_code, t.name AS team_name
       FROM meta_form_registrations r JOIN websites w ON w.id = r.website_id LEFT JOIN teams t ON t.id = r.assignment_team_id ORDER BY r.id DESC`,
    );
    return {
      endpoint: pushEndpoint(),
      targets: TARGETS.map(({ key, label, sfdc }) => ({ key, label, sfdc })),
      metaAttributes: META_ATTRIBUTES,
      standardQuestions: STANDARD_QUESTIONS,
      rows: rows.map((r) => ({ ...r, field_map: parseJson(r.field_map, {}), detected_fields: parseJson(r.detected_fields, []), push_url: pushEndpoint(r.api_key) })),
    };
  },

  async create(req, b) {
    await this.assertRefs(b);
    if (await one('SELECT id FROM meta_form_registrations WHERE form_id = ?', [b.formId])) throw conflict('This Meta form is already registered', 'META_FORM_EXISTS');
    const apiKey = newKey();
    // A pasted sheet only lists some fields: keep the defaults (UTM source/medium, project...) for the rest.
    const map = { ...autoMap([], b.projectName), ...sanitizeFieldMap(b.fieldMap) };
    const r = await query(
      `INSERT INTO meta_form_registrations (client_name, form_id, form_name, project_name, campaign_type, integration_type, api_key, website_id, assignment_team_id, field_map, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.clientName, b.formId, b.formName, b.projectName || null, b.campaignType || 'Facebook Campaign', b.integrationType || 'MIDDLEWARE', apiKey,
        b.websiteId, b.assignmentTeamId || null, JSON.stringify(map), req.auth.user.id],
    );
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_form', entityId: r.insertId, req, meta: { action: 'create', formId: b.formId, client: b.clientName } });
    return { id: r.insertId, apiKey, pushUrl: pushEndpoint(apiKey) };
  },

  async update(req, id, b) {
    const cur = await one('SELECT id, form_id FROM meta_form_registrations WHERE id = ?', [id]);
    if (!cur) throw notFound('Form not found');
    if (b.websiteId || b.assignmentTeamId) await this.assertRefs(b);
    if (b.formId && b.formId !== cur.form_id && await one('SELECT id FROM meta_form_registrations WHERE form_id = ? AND id <> ?', [b.formId, id])) {
      throw conflict('This Meta form is already registered', 'META_FORM_EXISTS');
    }
    const sets = [];
    const params = [];
    const set = (col, v) => { sets.push(`${col} = ?`); params.push(v); };
    if (b.clientName !== undefined) set('client_name', b.clientName);
    if (b.formId !== undefined) set('form_id', b.formId);
    if (b.formName !== undefined) set('form_name', b.formName);
    if (b.projectName !== undefined) set('project_name', b.projectName || null);
    if (b.campaignType !== undefined) set('campaign_type', b.campaignType || 'Facebook Campaign');
    if (b.integrationType !== undefined) set('integration_type', b.integrationType);
    if (b.websiteId !== undefined) set('website_id', b.websiteId);
    if (b.assignmentTeamId !== undefined) set('assignment_team_id', b.assignmentTeamId || null);
    if (b.fieldMap !== undefined) set('field_map', JSON.stringify(sanitizeFieldMap(b.fieldMap)));
    if (b.isActive !== undefined) set('is_active', b.isActive ? 1 : 0);
    if (!sets.length) return;
    await query(`UPDATE meta_form_registrations SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_form', entityId: id, req, meta: { action: 'update', fields: Object.keys(b) } });
  },

  /** Suggested mapping from the fields received so far (does not save). */
  async suggest(id) {
    const reg = await one('SELECT detected_fields, project_name FROM meta_form_registrations WHERE id = ?', [id]);
    if (!reg) throw notFound('Form not found');
    return { fieldMap: autoMap(parseJson(reg.detected_fields, []), reg.project_name) };
  },

  async rotate(req, id) {
    const apiKey = newKey();
    const r = await query('UPDATE meta_form_registrations SET api_key = ? WHERE id = ?', [apiKey, id]);
    if (!r.affectedRows) throw notFound('Form not found');
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_form', entityId: id, req, meta: { action: 'rotate' } });
    return { apiKey, pushUrl: pushEndpoint(apiKey) };
  },

  async remove(req, id) {
    const r = await query('DELETE FROM meta_form_registrations WHERE id = ?', [id]);
    if (!r.affectedRows) throw notFound('Form not found');
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_form', entityId: id, req, meta: { action: 'delete' } });
  },

  async assertRefs(b) {
    if (b.websiteId && !(await one('SELECT id FROM websites WHERE id = ?', [b.websiteId]))) throw badRequest('Unknown pipeline / website');
    if (b.assignmentTeamId && !(await one('SELECT id FROM teams WHERE id = ?', [b.assignmentTeamId]))) throw badRequest('Unknown team');
  },
};
