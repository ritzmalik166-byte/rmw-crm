/** Mirrors backend/src/config/leadSources.js. Use these instead of string literals. */
export const LEAD_SOURCE_TYPES = Object.freeze({
  MANUAL: 'MANUAL',
  WEBSITE: 'WEBSITE',
  META: 'META',
  WHATSAPP: 'WHATSAPP',
  OTHER: 'OTHER',
});

export const LEAD_SOURCE_LABELS = Object.freeze({
  MANUAL: 'Manual',
  WEBSITE: 'Website',
  META: 'Meta Ads',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other',
});

export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({ value, label }));
