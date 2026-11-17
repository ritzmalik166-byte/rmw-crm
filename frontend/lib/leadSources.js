/** Mirrors backend/src/config/leadSources.js. Use these instead of string literals. */
export const LEAD_SOURCE_TYPES = Object.freeze({
  MANUAL: 'MANUAL',
  WEBSITE: 'WEBSITE',
  META: 'META',
  LANDING_PAGE: 'LANDING_PAGE',
  META_FORM: 'META_FORM',
  WHATSAPP: 'WHATSAPP',
  OTHER: 'OTHER',
});

export const LEAD_SOURCE_LABELS = Object.freeze({
  MANUAL: 'Manual',
  WEBSITE: 'Website',
  META: 'Meta Ads',
  LANDING_PAGE: 'Client landing page',
  META_FORM: 'Client Meta form',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other',
});

export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({ value, label }));
