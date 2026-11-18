/**
 * CTMPL (Creative Thinks Media, WordPress) adapter.
 * Input: one form submission pushed by the site's mu-plugin (rmw-crm-leads.php) to POST /api/integrations/ctmpl/leads:
 *   { id, form_name, form_id?, name|first_name+last_name, phone, email, city?, service|project?, budget?, message?,
 *     page_url?, utm_*?, gclid?, created_at?, fields: { <any other label>: <value> } }
 * `id` is the WordPress entry id when the form plugin stores one, else a unique id made by the plugin.
 */
import { clean } from '../../utils/normalize.js';
import { extractAttribution, requireRawId, parseSourceDate } from '../canonical.js';

export const code = 'CTMPL';
export const ownDomain = 'creativethinksmedia.com';

const s = (v) => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v)).trim();

export function normalize(p) {
  const name = s(p.name || p.full_name || p.fullName) || [s(p.first_name), s(p.last_name)].filter(Boolean).join(' ');
  const attribution = extractAttribution(p);
  attribution.landing_page = attribution.landing_page || clean(p.page_url, 2048);
  attribution.page_name = attribution.page_name || clean(p.form_name, 255);
  const fields = p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields)
    ? Object.fromEntries(Object.entries(p.fields).slice(0, 40).map(([k, v]) => [String(k).slice(0, 80), s(v).slice(0, 1000)]))
    : {};
  return {
    externalRawId: requireRawId(p.id ?? p.entry_id ?? p.externalId, 'CTMPL'),
    name: clean(name, 150),
    phone: clean(s(p.phone || p.mobile), 40),
    email: clean(s(p.email), 190),
    location: clean(s(p.city || p.location)),
    interest: clean(s(p.service || p.project || p.interest || p.subject)),
    message: s(p.message) ? s(p.message).slice(0, 20000) : null,
    formType: clean(p.form_name, 80) || 'website',
    externalCreatedAt: parseSourceDate(p.created_at) || new Date(),
    attribution,
    extra: { formId: clean(s(p.form_id), 80), budget: clean(s(p.budget), 100), fields },
  };
}
