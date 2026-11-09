/**
 * CT (Contenaissance) adapter.
 * Input: the leads row sent from contenaissance /api/enquiry after INSERT:
 *   { id, type ('contact'|'footer'), full_name|fullName, email, phone|contactNumber, service|subject, message, source, status?, created_at? }
 * `source` is free text: 'new-website-contact', '<page url>#lead-popup', 'contact-page', 'footer'.
 * Country is embedded in the message ("Country: X"). No UTM is captured today; utm_* fields are accepted when added.
 */
import { clean } from '../../utils/normalize.js';
import { extractAttribution, parseLabeledMessage, requireRawId, parseSourceDate } from '../canonical.js';

export const code = 'CT';
export const ownDomain = 'contenaissance.com';

export function normalize(p) {
  const { fields } = parseLabeledMessage(p.message);
  const attribution = extractAttribution(p);
  const rawSource = clean(p.source, 255);
  if (rawSource && /^https?:\/\//i.test(rawSource)) {
    const [url, hash] = rawSource.split('#');
    attribution.landing_page = attribution.landing_page || url;
    attribution.page_name = attribution.page_name || (hash === 'lead-popup' ? 'Lead popup' : hash || null);
  } else if (rawSource) {
    attribution.page_name = attribution.page_name || rawSource;
  }
  attribution.extra = { ct_source: rawSource };

  const type = clean(p.type, 40) || 'contact';
  return {
    externalRawId: requireRawId(p.id ?? p.externalId, 'CT'),
    name: clean(p.full_name || p.fullName || p.name, 150),
    phone: clean(p.phone || p.contactNumber, 40),
    email: clean(p.email, 190),
    location: clean(fields.country || p.country),
    interest: clean(p.service || p.subject),
    message: p.message ? String(p.message).slice(0, 20000) : null,
    formType: rawSource?.includes('#lead-popup') ? `${type}-popup` : type,
    externalCreatedAt: parseSourceDate(p.created_at || p.createdAt || p.timestamp),
    attribution,
    extra: { type, sourceStatus: p.status || null },
  };
}
