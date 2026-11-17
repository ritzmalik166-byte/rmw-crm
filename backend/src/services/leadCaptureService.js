/**
 * Public Lead Capture API: clients put this in the lead forms of their landing pages.
 *
 *   GET or POST {APP_URL}/api/public/leads?api_key=KEY&name=..&phone=..&email=..&message=..&project=..
 *               &utm_source=..&utm_medium=..&utm_campaign=..&gclid=..&page_url=..
 *
 * Sell.do-style fields are accepted too (sell_do[form][lead][name|email|phone], sell_do[form][note][content],
 * sell_do[campaign][srd]), so a client moving from Sell.do only swaps the URL and key.
 *
 * gclid / utm_* are stored as attribution, so Google Ads leads show as google / cpc in the CRM.
 * Every lead goes through the shared Lead Processor: duplicate + repeat detection, assignment, live NEW_LEAD event.
 */
import { env } from '../config/env.js';
import { query, one } from '../config/db.js';
import { clean } from '../utils/normalize.js';
import { randomToken } from '../utils/crypto.js';
import { badRequest, unauthorized, forbidden, notFound } from '../utils/errors.js';
import { clientIp } from '../utils/http.js';
import { extractAttribution } from '../integrations/canonical.js';
import { upsertCanonicalLead } from './leadIngestService.js';
import { audit } from './auditService.js';
import { LEAD_SOURCE_TYPES } from '../config/leadSources.js';

const KEY_RE = /^lc_[A-Za-z0-9_-]{20,60}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** First non-empty value among keys, from the flat input. */
const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
};

/** Merge query + body (+ Sell.do nested shape) into one flat object. Pure; exported for tests. */
export function flattenInput(q = {}, body = {}) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const flat = { ...q, ...b };
  const sd = flat.sell_do || {};
  const lead = sd.form?.lead || {};
  return {
    ...flat,
    name: pick(flat, 'name', 'full_name', 'fullName', 'fullname') || pick(lead, 'name')
      || [pick(flat, 'first_name', 'firstName', 'fname'), pick(flat, 'last_name', 'lastName', 'lname')].filter(Boolean).join(' ') || null,
    phone: pick(flat, 'phone', 'mobile', 'mobile_number', 'phone_number', 'contact', 'contact_number', 'tel') || pick(lead, 'phone'),
    email: pick(flat, 'email', 'email_address', 'mail') || pick(lead, 'email'),
    message: pick(flat, 'message', 'note', 'notes', 'comments', 'comment', 'remarks', 'query') || pick(sd.form?.note, 'content'),
    project: pick(flat, 'project', 'project_name', 'property', 'interest', 'requirement'),
    city: pick(flat, 'city', 'location', 'locality'),
    budget: pick(flat, 'budget'),
    formName: pick(flat, 'form_name', 'formName', 'form'),
    pageUrl: pick(flat, 'page_url', 'pageUrl', 'landing_page', 'landingPage', 'url'),
    campaignCode: pick(sd.campaign, 'srd') || pick(flat, 'campaign_code', 'srd'),
    honeypot: pick(flat, '_hp', 'website_url', 'company_website'),
  };
}

function hostOf(url) {
  if (!url) return null;
  try { return new URL(String(url).includes('://') ? url : `https://${url}`).hostname.toLowerCase(); } catch { return null; }
}
const domainList = (s) => String(s || '').split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
const hostAllowed = (host, domains) => Boolean(host) && domains.some((d) => host === d || host.endsWith(`.${d}`));

/** Public endpoint base URL shown to admins. */
export function captureEndpoint() {
  const base = (env.PUBLIC_API_URL || env.APP_URL).replace(/\/$/, '');
  return `${base}/api/public/leads`;
}

export const leadCaptureService = {
  /** Handle one public submission. Returns { ok, reference, redirect? }. */
  async capture(req) {
    const input = flattenInput(req.query, req.body);
    const apiKey = pick(input, 'api_key', 'apiKey', 'key');
    if (!apiKey || !KEY_RE.test(apiKey)) throw unauthorized('Missing or invalid api_key', 'CAPTURE_KEY');
    const key = await one('SELECT * FROM lead_capture_keys WHERE api_key = ?', [apiKey]);
    if (!key || !key.is_active) throw unauthorized('Missing or invalid api_key', 'CAPTURE_KEY');

    const domains = domainList(key.allowed_domains);
    if (domains.length) {
      const host = hostOf(req.get('origin')) || hostOf(req.get('referer')) || hostOf(input.pageUrl);
      if (!hostAllowed(host, domains)) {
        await query('UPDATE lead_capture_keys SET last_error = ? WHERE id = ?', [`Rejected submission from ${host || 'unknown site'}`.slice(0, 500), key.id]);
        throw forbidden('This form is not allowed to send leads with this key', 'CAPTURE_DOMAIN');
      }
    }

    const redirect = (() => {
      const r = pick(input, 'redirect', 'redirect_url', 'thank_you_url');
      const h = hostOf(r);
      return r && /^https?:\/\//i.test(r) && h && (!domains.length || hostAllowed(h, domains)) ? r : null;
    })();

    // Bots filling the hidden field: answer OK, store nothing.
    if (input.honeypot) return { ok: true, reference: null, redirect };

    const email = input.email && EMAIL_RE.test(input.email) ? input.email.toLowerCase() : null;
    const phone = input.phone ? input.phone.replace(/[^\d+]/g, '').slice(0, 20) : null;
    if (!phone && !email) throw badRequest('Send at least a phone number or an email', 'VALIDATION_ERROR');

    const website = await one('SELECT id, code, domain, external_id_prefix FROM websites WHERE id = ?', [key.website_id]);
    if (!website) throw notFound('Pipeline for this key no longer exists');

    const attribution = extractAttribution(input);
    attribution.landing_page = attribution.landing_page || clean(input.pageUrl, 2048) || clean(req.get('referer'), 2048);
    attribution.page_name = attribution.page_name || clean(input.formName, 255);
    attribution.extra = { capture_key: key.name, campaign_code: input.campaignCode || undefined };

    const rawId = `LC${key.id}-${Date.now().toString(36)}${randomToken(4).replace(/[^A-Za-z0-9]/g, '').slice(0, 5)}`.toUpperCase();
    const extraFields = Object.fromEntries(Object.entries(input).filter(([k, v]) => /^(cf_|custom_|q_)/.test(k) && typeof v !== 'object').slice(0, 30)
      .map(([k, v]) => [k, String(v).slice(0, 500)]));

    const project = clean(input.project) || clean(key.default_project);
    const res = await upsertCanonicalLead(website, {
      externalRawId: rawId,
      sourceType: LEAD_SOURCE_TYPES.LANDING_PAGE,
      ad: { formName: key.name }, // client name: groups the lead in the Client Leads tab
      name: clean(input.name, 150),
      phone,
      email,
      location: clean(input.city),
      interest: project,
      message: input.message ? String(input.message).slice(0, 5000) : null,
      formType: clean(input.formName, 80) || 'landing_page',
      externalCreatedAt: new Date(),
      attribution,
      extra: { budget: input.budget || null, captureKey: key.name, ip: clientIp(req), userAgent: clean(req.get('user-agent'), 300), fields: extraFields },
      raw: { via: 'lead_capture_api', key: key.id },
      notify: { title: `New client lead · ${key.name}`, body: `${clean(input.name, 150) || 'Unnamed'}${project ? ` · ${project}` : ''}` },
    }, { assignment: { teamId: key.assignment_team_id || null } });

    await query('UPDATE lead_capture_keys SET leads_count = leads_count + ?, last_used_at = NOW(3), last_error = NULL WHERE id = ?', [res.created ? 1 : 0, key.id]);
    return { ok: true, reference: res.externalLeadId, redirect };
  },

  /* ── Admin ─────────────────────────────────────────────── */

  async list() {
    const rows = await query(
      `SELECT k.id, k.name, k.api_key, k.website_id, w.code AS website_code, k.assignment_team_id, t.name AS team_name, k.allowed_domains,
              k.default_project, k.is_active, k.leads_count, k.last_used_at, k.last_error, k.created_at
       FROM lead_capture_keys k JOIN websites w ON w.id = k.website_id LEFT JOIN teams t ON t.id = k.assignment_team_id ORDER BY k.id DESC`,
    );
    return { endpoint: captureEndpoint(), rows };
  },

  async create(req, b) {
    await this.assertRefs(b);
    const apiKey = `lc_${randomToken(24).replace(/[^A-Za-z0-9_-]/g, '')}`;
    const r = await query(
      `INSERT INTO lead_capture_keys (name, api_key, website_id, assignment_team_id, allowed_domains, default_project, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.name, apiKey, b.websiteId, b.assignmentTeamId || null, domainList(b.allowedDomains).join(', ') || null, b.defaultProject || null, req.auth.user.id],
    );
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_capture_key', entityId: r.insertId, req, meta: { action: 'create', name: b.name } });
    return { id: r.insertId, apiKey };
  },

  async update(req, id, b) {
    const k = await one('SELECT id FROM lead_capture_keys WHERE id = ?', [id]);
    if (!k) throw notFound('Key not found');
    if (b.websiteId || b.assignmentTeamId) await this.assertRefs(b);
    await query(
      `UPDATE lead_capture_keys SET name = COALESCE(?, name), website_id = COALESCE(?, website_id),
         assignment_team_id = IF(?, ?, assignment_team_id), allowed_domains = IF(?, ?, allowed_domains),
         default_project = IF(?, ?, default_project), is_active = COALESCE(?, is_active) WHERE id = ?`,
      [b.name ?? null, b.websiteId ?? null,
        'assignmentTeamId' in b ? 1 : 0, b.assignmentTeamId || null,
        'allowedDomains' in b ? 1 : 0, domainList(b.allowedDomains).join(', ') || null,
        'defaultProject' in b ? 1 : 0, b.defaultProject || null,
        b.isActive === undefined ? null : b.isActive ? 1 : 0, id],
    );
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_capture_key', entityId: id, req, meta: { action: 'update', ...b } });
  },

  async rotate(req, id) {
    const apiKey = `lc_${randomToken(24).replace(/[^A-Za-z0-9_-]/g, '')}`;
    const r = await query('UPDATE lead_capture_keys SET api_key = ? WHERE id = ?', [apiKey, id]);
    if (!r.affectedRows) throw notFound('Key not found');
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_capture_key', entityId: id, req, meta: { action: 'rotate' } });
    return { apiKey };
  },

  async remove(req, id) {
    const r = await query('DELETE FROM lead_capture_keys WHERE id = ?', [id]);
    if (!r.affectedRows) throw notFound('Key not found');
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'lead_capture_key', entityId: id, req, meta: { action: 'delete' } });
  },

  async assertRefs(b) {
    if (b.websiteId && !(await one('SELECT id FROM websites WHERE id = ?', [b.websiteId]))) throw badRequest('Unknown pipeline / website');
    if (b.assignmentTeamId && !(await one('SELECT id FROM teams WHERE id = ?', [b.assignmentTeamId]))) throw badRequest('Unknown team');
  },
};
