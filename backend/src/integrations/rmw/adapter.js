/**
 * RMW (Ritz Media World) adapter.
 * Input: the enquiries row sent from rmw-backend /api/system-settings/contact-enquiry after INSERT:
 *   { id, etype, name, email, mobile|phone, message, category?, resume?, send_date?, ...optional attribution }
 * etype values seen: ContactUs, career, HomePageDownload, NavbarConsulting, NewspaperAdEnquiry, contact.
 * new-rmw packs "Reason for Inquiry", "Country" and "How did you hear about us" into the message; we parse them out.
 * Attribution arrives as utm_* fields and/or a "--- Tracking ---" block appended to the message.
 */
import { clean } from '../../utils/normalize.js';
import { extractAttribution, parseLabeledMessage, splitTrackingBlock, requireRawId, parseSourceDate } from '../canonical.js';

export const code = 'RMW';
export const ownDomain = 'ritzmediaworld.com';

export function normalize(p) {
  const { tracking, message: cleanMessage } = splitTrackingBlock(p.message);
  const { fields } = parseLabeledMessage(cleanMessage);
  const attribution = extractAttribution(p, [tracking]);
  const heardFrom = fields['how did you hear about us'] || p.heardFrom || null;
  attribution.extra = { self_reported_source: heardFrom, resume: p.resume || p.resumePath || null };

  return {
    externalRawId: requireRawId(p.id ?? p.externalId, 'RMW'),
    name: clean(p.name, 150),
    phone: clean(p.mobile || p.phone, 40),
    email: clean(p.email, 190),
    location: clean(fields.country || p.country),
    interest: clean(fields.service || fields['reason for inquiry'] || p.reason || p.category),
    message: cleanMessage ? String(cleanMessage).slice(0, 20000) : null,
    formType: clean(p.etype, 80) || 'contact',
    externalCreatedAt: parseSourceDate(p.send_date || p.createdAt),
    attribution,
    extra: { etype: p.etype || null, category: p.category || null, reason: fields['reason for inquiry'] || null },
  };
}
