/**
 * Canonical CRM lead produced by every adapter:
 * {
 *   externalRawId, name, phone, email, location, interest, message, formType, externalCreatedAt,
 *   attribution: { source, medium, campaign, term, content, landing_page, referrer, utm_source, utm_medium,
 *                  utm_campaign, utm_term, utm_content, gclid, fbclid, msclkid, page_name, extra },
 *   extra: {...}   // any other source fields, preserved verbatim
 * }
 */
import { clean } from '../utils/normalize.js';
import { badRequest } from '../utils/errors.js';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const CLICK_KEYS = ['gclid', 'fbclid', 'msclkid'];

/** Pull attribution fields from any of the common shapes: top level, payload.utm, payload.attribution, payload.tracking. */
export function extractAttribution(payload, extraSources = []) {
  const bags = [payload, payload?.utm, payload?.attribution, payload?.tracking, payload?.metadata?.utm, ...extraSources].filter((b) => b && typeof b === 'object');
  const pick = (...keys) => {
    for (const bag of bags) for (const k of keys) if (bag[k] !== undefined && bag[k] !== null && String(bag[k]).trim() !== '') return String(bag[k]).trim();
    return null;
  };
  const a = {};
  UTM_KEYS.forEach((k) => { a[k] = clean(pick(k, k.replace('utm_', 'utm').replace(/_(\w)/, (_, c) => c.toUpperCase())), 255); });
  if (!a.utm_term) a.utm_term = clean(pick('utm_keyword'), 255);
  CLICK_KEYS.forEach((k) => { a[k] = clean(pick(k), 255); });
  a.landing_page = clean(pick('landing_page', 'landingPage', 'landing_url'), 2048);
  a.referrer = clean(pick('referrer', 'referer', 'document_referrer'), 2048);
  a.page_name = clean(pick('page_name', 'pageName'), 255);
  return a;
}

const SEARCH_ENGINES = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.'];
const SOCIAL = { 'facebook.': 'facebook', 'fb.': 'facebook', 'instagram.': 'instagram', 'linkedin.': 'linkedin', 't.co': 'twitter', 'twitter.': 'twitter', 'x.com': 'twitter', 'youtube.': 'youtube' };

/** Derive normalised source / medium / campaign. Explicit UTM always wins; click IDs and referrer are fallbacks. */
export function deriveSourceMedium(a, ownDomain) {
  const out = { source: null, medium: null, campaign: a.utm_campaign, term: a.utm_term, content: a.utm_content };
  if (a.utm_source) { out.source = a.utm_source; out.medium = a.utm_medium; return out; }
  if (a.gclid) return { ...out, source: 'google', medium: 'cpc' };
  if (a.msclkid) return { ...out, source: 'bing', medium: 'cpc' };
  if (a.fbclid) return { ...out, source: 'facebook', medium: 'paid_social' };
  if (a.referrer) {
    let host = '';
    try { host = new URL(a.referrer.includes('://') ? a.referrer : `https://${a.referrer}`).hostname.toLowerCase(); } catch { /* ignore */ }
    if (host && ownDomain && host.endsWith(ownDomain)) return { ...out, source: 'direct', medium: 'none' };
    const se = SEARCH_ENGINES.find((s) => host.includes(s));
    if (se) return { ...out, source: se.replace('.', ''), medium: 'organic' };
    const social = Object.entries(SOCIAL).find(([k]) => host.includes(k));
    if (social) return { ...out, source: social[1], medium: 'social' };
    if (host) return { ...out, source: host.replace(/^www\./, ''), medium: 'referral' };
  }
  return { ...out, source: 'direct', medium: 'none' };
}

/**
 * RMW and CT forms append attribution to the message as a "--- Tracking ---" block of "key: value" lines
 * (it survives source backends that drop unknown fields). Returns the parsed fields and the message without it.
 */
const TRACKING_KEYS = new Set([...UTM_KEYS, ...CLICK_KEYS, 'landing_page', 'referrer']);
export function splitTrackingBlock(message) {
  if (!message) return { tracking: {}, message };
  const s = String(message);
  const idx = s.lastIndexOf('--- Tracking ---');
  if (idx === -1) return { tracking: {}, message: s };
  const tracking = {};
  for (const line of s.slice(idx + 16).split(/\r?\n/)) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/);
    if (m && TRACKING_KEYS.has(m[1])) tracking[m[1]] = m[2];
  }
  return { tracking, message: s.slice(0, idx).trimEnd() || null };
}

/** Parse "Label: value" lines that RMW and CT pack into the message body. */
export function parseLabeledMessage(message) {
  const fields = {};
  if (!message) return { fields, body: null };
  const lines = String(message).split(/\r?\n/);
  const rest = [];
  for (const line of lines) {
    const m = line.match(/^\s*(Reason for Inquiry|Country|How did you hear about us|Message)\s*:\s*(.*)$/i);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
    else rest.push(line);
  }
  const svc = String(message).match(/\[Service:\s*([^\]]+)\]/i);
  if (svc) fields.service = svc[1].trim();
  return { fields, body: String(message) };
}

export function requireRawId(raw, site) {
  const id = clean(raw, 90);
  if (!id) throw badRequest(`${site} payload is missing the source lead id`, 'VALIDATION_ERROR');
  return id;
}

/** Parse a timestamp; values without a zone are treated as IST (all three source systems run in IST). */
export function parseSourceDate(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = `${s.replace(' ', 'T')}+05:30`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
