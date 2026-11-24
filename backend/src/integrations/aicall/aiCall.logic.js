/**
 * Pure helpers for the AI calling agent (no DB, no network) so they can be unit-tested.
 * Times are handled in IST (UTC+05:30), the timezone every calling-hours rule here is written in.
 */
import { normalizePhone } from '../../utils/normalize.js';

export const IST_OFFSET_MS = 330 * 60_000;

export const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  provider: 'simulator', // simulator | vapi | bolna
  websites: ['MPF'], // website codes whose new leads get a call
  delayMinutes: 5,
  windowStart: '09:00', // IST
  windowEnd: '21:00', // IST
  maxAttempts: 3,
  retryMinutes: [30, 120], // wait after attempt 1, after attempt 2, …
  skipIfWorked: true, // don't call if someone on the team has already worked the lead
  recentCallDays: 7, // don't call the same number again within this many days (duplicate leads)
  openingLine: 'Namaste {name}, this is the automated assistant from {brand} calling about your enquiry for {project}. This call is recorded for quality. Is this a good time to talk for two minutes?',
  questions: [
    'Are you still looking for a property?',
    'Which configuration do you need: 1, 2, 3 or 4 BHK, a plot or commercial?',
    'What is your budget range?',
    'Which location or sector do you prefer?',
    'Is it for self-use or investment?',
    'When do you plan to buy: immediately, within 3 months, within 6 months or later?',
    'Would you like to book a site visit? Which day suits you?',
    'What is the best time for our property advisor to call you back?',
  ],
  language: 'hinglish', // hinglish | hindi | english
  // Per-website overrides: a different provider agent, opening line and questions per business.
  // Empty values fall back to the defaults above.
  profiles: {
    RMW: {
      agentId: '',
      openingLine: 'Namaste {name}, this is the automated assistant from Ritz Media World, calling about your enquiry on our website. This call is recorded for quality. Is this a good time to talk for two minutes?',
      questions: [
        'What is the name of your company or brand, and what do you do?',
        'Which service are you looking for: digital marketing, SEO, social media, Google or Meta ads, branding and design, website development, print, radio or influencer marketing?',
        'What is the main goal: more leads, more sales, brand awareness, a new website or a product launch?',
        'Are you running any marketing right now, in-house or with another agency?',
        'What monthly marketing budget do you have in mind, roughly?',
        'When would you like to start?',
        'Are you the decision maker, or should someone else join the discussion?',
        'When is a good time for our strategist to call you or set up a meeting?',
      ],
    },
  },
});

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const minutesOf = (hhmm) => { const m = HHMM.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Merge a stored config over the defaults, dropping anything malformed. */
export function resolveConfig(stored) {
  const c = { ...DEFAULT_CONFIG, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (minutesOf(c.windowStart) === null) c.windowStart = DEFAULT_CONFIG.windowStart;
  if (minutesOf(c.windowEnd) === null) c.windowEnd = DEFAULT_CONFIG.windowEnd;
  c.delayMinutes = clampInt(c.delayMinutes, 1, 1440, DEFAULT_CONFIG.delayMinutes);
  c.maxAttempts = clampInt(c.maxAttempts, 1, 5, DEFAULT_CONFIG.maxAttempts);
  c.recentCallDays = clampInt(c.recentCallDays, 0, 90, DEFAULT_CONFIG.recentCallDays);
  c.retryMinutes = (Array.isArray(c.retryMinutes) ? c.retryMinutes : DEFAULT_CONFIG.retryMinutes).map((n) => clampInt(n, 5, 1440, 60));
  c.websites = Array.isArray(c.websites) ? c.websites.map(String) : [];
  c.questions = cleanQuestions(c.questions);
  c.profiles = cleanProfiles(c.profiles);
  return c;
}

const cleanQuestions = (q) => (Array.isArray(q) ? q.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : []);

function cleanProfiles(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [code, v] of Object.entries(p)) {
    if (!/^[A-Z0-9_]{1,20}$/.test(code) || !v || typeof v !== 'object') continue;
    out[code] = {
      agentId: /^[\w-]{0,100}$/.test(String(v.agentId || '')) ? String(v.agentId || '') : '',
      openingLine: String(v.openingLine || '').trim().slice(0, 600),
      questions: cleanQuestions(v.questions),
    };
  }
  return out;
}

/** The agent, opening line and questions for a website: its own profile where set, else the defaults. */
export function profileFor(cfg, websiteCode) {
  const p = cfg.profiles?.[websiteCode] || {};
  return {
    agentId: p.agentId || null,
    openingLine: p.openingLine || cfg.openingLine,
    questions: p.questions?.length ? p.questions : cfg.questions,
  };
}

function clampInt(v, lo, hi, d) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}

/** Minutes since IST midnight for a Date. */
export function istMinutes(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** True when `date` falls inside the IST calling window [start, end). */
export function inCallingWindow(date, start, end) {
  const now = istMinutes(date);
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === null || e === null || s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e; // supports a window that crosses midnight
}

/** The next moment (as a Date) the calling window opens, at or after `date`. */
export function nextWindowStart(date, start) {
  const s = minutesOf(start) ?? 0;
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const midnightIstUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
  let open = midnightIstUtc + s * 60_000;
  if (open <= date.getTime()) open += 86_400_000;
  return new Date(open);
}

/** When the call should happen: now + delay, pushed to the next window opening if that lands outside calling hours. */
export function plannedCallTime(from, cfg, delayMinutes = cfg.delayMinutes) {
  const at = new Date(from.getTime() + delayMinutes * 60_000);
  return inCallingWindow(at, cfg.windowStart, cfg.windowEnd) ? at : nextWindowStart(at, cfg.windowStart);
}

/** Indian mobile in E.164 (+91XXXXXXXXXX), or null when the number can't be called. */
export function toIndianMobileE164(raw) {
  const d = normalizePhone(raw);
  return d && /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** Fill {name}, {brand}, {project}, {city} in a template. */
export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString().trim() || defaultsFor(k));
}
const defaultsFor = (k) => ({ name: 'there', project: 'your property enquiry', brand: 'our team', city: '' }[k] ?? '');

/** Retry plan after an unanswered attempt: minutes to wait, or null when no attempts are left. */
export function retryDelay(attempt, cfg) {
  if (attempt >= cfg.maxAttempts) return null;
  const list = cfg.retryMinutes.length ? cfg.retryMinutes : DEFAULT_CONFIG.retryMinutes;
  return list[Math.min(attempt - 1, list.length - 1)];
}

/* ---------- Reading a provider's end-of-call result ---------- */

const YES = /^(y|yes|true|haan|ha|han|interested|1)$/i;
const NO = /^(n|no|false|nahi|nahin|not interested|0)$/i;
const truthy = (v) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v > 0 : typeof v === 'string' ? YES.test(v.trim()) : false);
const falsy = (v) => (typeof v === 'boolean' ? !v : typeof v === 'string' ? NO.test(v.trim()) : false);

const KEY_ALIASES = {
  interested: ['interested', 'is_interested', 'still_looking', 'stillLooking', 'isInterested', 'interest_confirmed', 'project_interest', 'interest_status'],
  service: ['service', 'service_interest', 'services', 'service_needed', 'service_required'],
  company: ['company', 'company_name', 'business_name', 'brand_name', 'brand'],
  goal: ['goal', 'marketing_goal', 'objective', 'business_goal'],
  currentMarketing: ['current_marketing', 'currentMarketing', 'existing_agency', 'current_agency'],
  decisionMaker: ['decision_maker', 'decisionMaker', 'is_decision_maker'],
  website: ['website', 'website_url', 'websiteUrl'],
  configuration: ['configuration', 'bhk', 'bhk_type', 'bhkType', 'unit_type', 'unitType', 'property_type', 'propertyType'],
  budget: ['budget', 'budget_range', 'budgetRange', 'monthly_budget', 'marketing_budget'],
  location: ['location', 'preferred_location', 'preferredLocation', 'location_preference', 'sector', 'city'],
  purpose: ['purpose', 'self_use_or_investment', 'buying_for', 'buyingFor'],
  timeline: ['timeline', 'buying_timeline', 'buyingTimeline', 'purchase_timeline', 'when_to_buy', 'purchase_timeframe', 'start_timeline', 'start_date'],
  siteVisit: ['site_visit', 'siteVisit', 'site_visit_interest', 'siteVisitInterest', 'wants_site_visit', 'site_visit_day', 'siteVisitDay'],
  callbackTime: ['callback_time', 'callbackTime', 'callback_datetime', 'meeting_time', 'preferred_meeting_time', 'best_time_to_call', 'bestTimeToCall', 'call_back_time'],
  optOut: ['opt_out', 'optOut', 'do_not_call', 'doNotCall', 'dnd'],
  wrongNumber: ['wrong_number', 'wrongNumber'],
  wantsHuman: ['wants_human', 'wantsHuman', 'transfer_requested', 'talk_to_human'],
  language: ['language', 'preferred_language'],
  notes: ['notes', 'other_notes', 'remarks'],
  outcome: ['outcome', 'call_outcome', 'callOutcome', 'disposition'],
};

/** Map whatever field names the provider's extraction used onto our fixed set of answers. */
export function normalizeAnswers(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const lower = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
  const out = {};
  for (const [key, aliases] of Object.entries(KEY_ALIASES)) {
    for (const a of aliases) {
      const v = lower[a.toLowerCase()];
      if (v !== undefined && v !== null && v !== '') { out[key] = typeof v === 'object' ? JSON.stringify(v) : v; break; }
    }
  }
  return out;
}

const OUTCOMES = ['INTERESTED', 'NOT_INTERESTED', 'CALLBACK', 'WRONG_NUMBER', 'DO_NOT_CALL', 'UNCLEAR'];

/** One outcome for the call from the answers. Opt-out wins over everything else. */
export function deriveOutcome(a) {
  if (truthy(a.optOut)) return 'DO_NOT_CALL';
  if (truthy(a.wrongNumber)) return 'WRONG_NUMBER';
  const explicit = typeof a.outcome === 'string' ? a.outcome.trim().toUpperCase().replace(/[\s-]+/g, '_') : null;
  if (explicit && OUTCOMES.includes(explicit)) return explicit;
  if (falsy(a.interested)) return 'NOT_INTERESTED';
  if (a.callbackTime && !truthy(a.interested)) return 'CALLBACK';
  if (truthy(a.interested)) return 'INTERESTED';
  if (a.callbackTime) return 'CALLBACK';
  return 'UNCLEAR';
}

/** Map a provider's end reason / status onto our call status. */
export function statusFromEnd(reason) {
  const r = String(reason || '').toLowerCase();
  if (!r) return 'COMPLETED';
  if (/busy/.test(r)) return 'BUSY';
  if (/no[-_ ]?answer|did[-_ ]not[-_ ]answer|not[-_ ]answered|unanswered|voicemail|ring[-_ ]?timeout|not[-_ ]reachable/.test(r)) return 'NO_ANSWER';
  if (/fail|error|invalid|rejected|cancel|unavailable|could[-_ ]not/.test(r)) return 'FAILED';
  return 'COMPLETED';
}

/** Plain-text transcript from either a string or a list of {role, message} turns. */
export function transcriptText(t) {
  if (!t) return null;
  if (typeof t === 'string') return t.trim() || null;
  if (Array.isArray(t)) {
    const lines = t
      .filter((m) => m && (m.message || m.content || m.text) && m.role !== 'system')
      .map((m) => `${/^(assistant|bot|agent)$/i.test(m.role) ? 'Agent' : 'Customer'}: ${String(m.message || m.content || m.text).trim()}`);
    return lines.join('\n') || null;
  }
  return null;
}
