/**
 * MetaConversionService: prepares server-side conversion events for leads that came from Meta Lead Ads,
 * shaped for the Conversions API "CRM / conversion leads" integration (action_source system_generated,
 * user_data.lead_id = the Meta leadgen id, hashed email/phone, custom_data.event_source = "crm").
 *
 * Sending is intentionally NOT enabled. Before turning it on you need, per Meta's current requirements:
 *  - a Meta dataset (Pixel) id linked to the ad account, and a system-user token allowed to post to it
 *  - the CRM funnel stages configured in Events Manager (names must match CAPI_EVENT_NAMES)
 *  - a review of event names/fields against the live Conversions API docs for the Graph version in META_API_VERSION
 * Implement `transport` then; everything else (what to send, when, idempotency, status tracking) is in place.
 */
import crypto from 'node:crypto';
import { query, one } from '../../config/db.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { normalizePhone } from '../../utils/normalize.js';
import { CONVERSION_TYPES } from '../../config/leadSources.js';
import { PROVIDER } from './meta.config.js';

/** CRM conversion type -> event name sent to Meta. Must match the stage names set up in Events Manager. */
export const CAPI_EVENT_NAMES = Object.freeze({
  [CONVERSION_TYPES.QUALIFIED]: 'Qualified Lead',
  [CONVERSION_TYPES.SITE_VISIT]: 'Site Visit',
  [CONVERSION_TYPES.CONVERTED]: 'Converted',
});

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

/** Meta normalisation before hashing: email trimmed + lower-case; phone digits only with country code (India default). */
export function hashEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.includes('@') ? sha256(e) : null;
}
export function hashPhone(phone, defaultCountryCode = '91') {
  const n = normalizePhone(phone);
  if (!n) return null;
  return sha256(n.length === 10 ? `${defaultCountryCode}${n}` : n);
}

/** Build the event payload (pure; unit-tested). Returns null when the lead can't be matched by Meta. */
export function buildConversionEvent(lead, conversion) {
  const eventName = CAPI_EVENT_NAMES[conversion.conversion_type];
  if (!eventName || !lead?.source_lead_id) return null;
  const userData = { lead_id: String(lead.source_lead_id) };
  const em = hashEmail(lead.email);
  const ph = hashPhone(lead.phone);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  const customData = { event_source: 'crm', lead_event_source: 'RMW CRM' };
  if (conversion.conversion_value != null) {
    customData.value = Number(conversion.conversion_value);
    customData.currency = conversion.currency || 'INR';
  }
  return {
    event_name: eventName,
    event_time: Math.floor(new Date(conversion.conversion_date).getTime() / 1000),
    action_source: 'system_generated',
    event_id: `crm-${lead.id}-${conversion.conversion_type}`, // dedupe key on Meta's side
    user_data: userData,
    custom_data: customData,
  };
}

export const metaConversion = {
  /** Sending stays off until a transport is implemented and configured (see header). */
  isEnabled: () => false,

  /** Worker: prepare (and later send) one conversion. Records the outcome on lead_conversions. */
  async dispatch(conversionId) {
    const conv = await one('SELECT * FROM lead_conversions WHERE id = ?', [conversionId]);
    if (!conv || conv.provider !== PROVIDER || conv.provider_sync_status !== 'PENDING') return null;
    const lead = await one('SELECT id, source_lead_id, email, phone FROM leads WHERE id = ?', [conv.lead_id]);
    const event = buildConversionEvent(lead, conv);
    if (!event) {
      await query("UPDATE lead_conversions SET provider_sync_status = 'SKIPPED', provider_sync_error = ? WHERE id = ?", ['Lead has no Meta lead id', conversionId]);
      return null;
    }
    if (!metaConversion.isEnabled()) {
      await query("UPDATE lead_conversions SET provider_sync_status = 'SKIPPED', provider_sync_error = ? WHERE id = ?", ['Conversions API sending is not enabled', conversionId]);
      await integrationLog(PROVIDER, 'info', 'CONVERSION_PREPARED', `${event.event_name} prepared for lead ${lead.id} (sending disabled)`, { leadId: lead.id, eventName: event.event_name });
      return event;
    }
    return event;
  },
};
