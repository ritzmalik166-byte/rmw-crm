/**
 * MPF (MyPropertyFact) adapter.
 * Input: the payload already sent by mpf-backend CrmIntegrationService.pushEnquiry():
 *   { externalId, name, email, phone, message, enquiryFrom, pageName, projectLink, status, whatsapp?, createdAt, metadata }
 *   metadata = { utm:{...,referrer,landing_page,exit_page}, device, geo, journey, session, analytics, property? }
 * The webhook also fires on updates, so ingestion upserts on the external id.
 */
import { clean } from '../../utils/normalize.js';
import { extractAttribution, requireRawId, parseSourceDate } from '../canonical.js';

export const code = 'MPF';
export const ownDomain = 'mypropertyfact.in';

function parseMetadata(m) {
  if (!m) return {};
  if (typeof m === 'object') return m;
  try { return JSON.parse(m); } catch { return { unparsed: String(m).slice(0, 5000) }; }
}

export function normalize(p) {
  const meta = parseMetadata(p.metadata ?? p.metadataJson);
  const utm = meta.utm || {};
  const geo = meta.geo || {};
  const property = meta.property || {};
  const attribution = extractAttribution({ ...p, metadata: meta }, [utm]);
  attribution.page_name = clean(p.pageName, 255) || attribution.page_name;
  attribution.extra = { exit_page: utm.exit_page || null, project_link: p.projectLink || null };

  const location = [property.locality, property.city || geo.city, geo.state, geo.country].filter(Boolean).join(', ') || null;
  const interest = property.project || property.property_name || clean(p.pageName) || null;

  return {
    externalRawId: requireRawId(p.externalId ?? p.id, 'MPF'),
    name: clean(p.name, 150),
    phone: clean(p.phone, 40),
    email: clean(p.email, 190),
    location: clean(location),
    interest: clean(interest),
    message: p.message ? String(p.message).slice(0, 20000) : null,
    formType: clean(p.pageName, 80) || 'enquiry',
    externalCreatedAt: parseSourceDate(p.createdAt),
    attribution,
    extra: {
      enquiryFrom: p.enquiryFrom || null,
      projectLink: p.projectLink || null,
      whatsapp: p.whatsapp || null,
      sourceStatus: p.status || null,
      property,
      device: meta.device || null,
      geo,
      session: meta.session || null,
      analytics: meta.analytics || null,
      journey: Array.isArray(meta.journey) ? meta.journey.slice(-50) : null,
    },
  };
}
