/**
 * Junk-lead detection. Returns a short reason code when a lead is not a real business enquiry, else null.
 * Junk leads are still stored (so a re-sync never re-creates them) but are hidden from the leads list by default.
 */

const INTERNAL_EMAIL_DOMAINS = ['ctm.co.in', 'ritzmediaworld.com', 'ritzmediaworld.in', 'contenaissance.com', 'mypropertyfact.in', 'mypropertyfact.com'];
const INTERNAL_EMAILS = ['aryantomar239@gmail.com'];

const TEST_WORD = /\b(test|testing|tester|demo|dummy|sample|asdf|qwerty|xyz|abc)\b/i;
const DISPOSABLE = /(mailinator|tempmail|yopmail|guerrillamail|10minutemail|trashmail|sharklasers|example\.(com|org|net))/i;
const SPAM_TEXT = new RegExp([
  'seo (services|agency|expert)', 'backlinks?', 'guest post', 'link building', 'rank(ing)? (your|on) (website|google)',
  'first page of google', 'web ?design (services|company)', 'crypto', 'bitcoin', 'casino', 'betting', 'viagra', 'cialis',
  'loan offer', 'investment opportunity', 'lead generation (service|agency)', 'we (can|will) (help|increase|boost)',
  'unsubscribe', 'opt[- ]?out', 'appointment setting', 'virtual assistant', 'outsourc', 'white[- ]label', 'delivery capacity',
  'saw this article', 'reading (this|your) article', 'scale your o', 'guestpost', 'scooparticle',
].join('|'), 'i');
const SPAM_DOMAINS = /(referral-station|growth|leads?\.|marketing|seo|outreach)[^@]*$/i;
const PLACEHOLDER_EMAIL = /^(homepage|services|home|noreply|no-reply)@/;
const JOB_SEEKER = /(job opening|join your (organi[sz]ation|team|company)|my (resume|cv|portfolio)|portfolio website|application for the (post|role)|subject:? application|eligible for (the|this) (role|post))/i;

/** Reasons that mean "not a sales lead at all" rather than "fake". */
export const NON_LEAD_REASONS = ['career', 'job_seeker'];

export function junkReason({ name, email, phone, message, formType, websiteCode }) {
  const n = String(name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  const m = String(message || '');
  const digits = String(phone || '').replace(/\D/g, '');
  const local10 = digits.slice(-10);
  const ft = String(formType || '').toLowerCase();

  if (websiteCode === 'RMW' && ft === 'career') return 'career';

  if (!n && !e && !digits) return 'empty';
  if (TEST_WORD.test(n) || /^test|test@|testdata/.test(e)) return 'test';
  if (INTERNAL_EMAILS.includes(e) || (!PLACEHOLDER_EMAIL.test(e) && INTERNAL_EMAIL_DOMAINS.some((d) => e.endsWith(`@${d}`)))) return 'internal';
  if (DISPOSABLE.test(e)) return 'test';
  if (n.length < 2 || /^[^a-zऀ-ॿ]+$/i.test(n)) return 'bad_name';
  if (/[Ѐ-ӿ一-鿿]/.test(n + m)) return 'spam';
  if (digits && (digits.length < 10 || /^(\d)\1{9}$/.test(local10) || ['1234567890', '9876543210', '0123456789'].includes(local10))) return 'bad_phone';
  if (JOB_SEEKER.test(m)) return 'job_seeker';
  if (SPAM_TEXT.test(m) || (e && SPAM_DOMAINS.test(e.split('@')[1] || ''))) return 'spam';
  return null;
}
