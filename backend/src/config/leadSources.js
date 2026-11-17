/**
 * Where a lead came from. Stored in leads.source_type. Always use these constants, never string literals.
 * (lead_attributions.source / medium keep the finer-grained channel, e.g. "facebook" / "paid_social".)
 */
export const LEAD_SOURCE_TYPES = Object.freeze({
  MANUAL: 'MANUAL',
  WEBSITE: 'WEBSITE',
  META: 'META',
  WHATSAPP: 'WHATSAPP',
  OTHER: 'OTHER',
});

export const LEAD_SOURCE_TYPE_LIST = Object.values(LEAD_SOURCE_TYPES);

export const LEAD_SOURCE_LABELS = Object.freeze({
  MANUAL: 'Manual',
  WEBSITE: 'Website',
  META: 'Meta Ads',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other',
});

/** Pipeline stages that count as conversions for ad-platform reporting (lead_conversions.conversion_type). */
export const CONVERSION_TYPES = Object.freeze({
  QUALIFIED: 'QUALIFIED',
  SITE_VISIT: 'SITE_VISIT',
  CONVERTED: 'CONVERTED',
});

/** Lead status code -> conversion type. A status flagged is_conversion always maps to CONVERTED. */
export const CONVERSION_TYPE_BY_STATUS = Object.freeze({
  QUALIFIED: CONVERSION_TYPES.QUALIFIED,
  SITE_VISIT: CONVERSION_TYPES.SITE_VISIT,
  CONVERTED: CONVERSION_TYPES.CONVERTED,
});
