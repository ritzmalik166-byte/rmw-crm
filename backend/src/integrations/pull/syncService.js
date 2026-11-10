/**
 * Pull sync: imports existing leads from each website's own listing API (backfill + periodic fallback to webhooks).
 * Read-only against the source sites. Upserts on (website, external id), so it is safe to run repeatedly.
 *
 *  MPF  GET  {MPF_API_URL}/enquiry/crm-export            header x-mpf-crm-key: MPF_CRM_EXPORT_KEY
 *       (fallback: admin-portal login -> GET /enquiry/get-all with MPF_ADMIN_EMAIL / MPF_ADMIN_PASSWORD)
 *  RMW  GET  {RMW_ENQUIRY_LIST_URL}                      (public endpoint on rmw-backend)
 *  CT   POST {CT_API_URL}/api/auth/login -> ct_admin_token cookie, then GET /api/leads?page=&limit=100
 */
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { query, one } from '../../config/db.js';
import { getAdapter } from '../index.js';
import { upsertCanonicalLead } from '../../services/leadIngestService.js';
import { AppError } from '../../utils/errors.js';

const TIMEOUT_MS = 60_000;

// Source status -> CRM status code (applied only when a lead is first created; CRM edits are never overwritten).
const STATUS_MAP = {
  MPF: { new: 'NEW', pending: 'NEW', shared: 'CONTACTED', rejected: 'NOT_INTERESTED', irrelevant: 'NOT_INTERESTED', test: 'NOT_INTERESTED', duplicate: 'NOT_INTERESTED' },
  CT: { pending: 'NEW', contacted: 'CONTACTED', qualified: 'QUALIFIED', converted: 'CONVERTED', lost: 'LOST' },
  RMW: {},
};

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new AppError(`${new URL(url).host} responded ${res.status}`, { status: 502, errorCode: 'SOURCE_HTTP_ERROR' });
  try { return JSON.parse(text); } catch { throw new AppError(`${new URL(url).host} did not return JSON`, { status: 502, errorCode: 'SOURCE_BAD_JSON' }); }
}

const FETCHERS = {
  async MPF() {
    if (!env.MPF_API_URL) throw new AppError('Set MPF_API_URL to sync MPF', { status: 400, errorCode: 'SYNC_NOT_CONFIGURED' });
    const base = env.MPF_API_URL.replace(/\/$/, '');
    const asRows = (b) => (Array.isArray(b) ? b : b?.data || []);
    // Preferred: one call to MPF's dedicated export API (all enquiries, key-protected).
    if (env.MPF_CRM_EXPORT_KEY) {
      try {
        return asRows(await getJson(`${base}/enquiry/crm-export`, { headers: { 'x-mpf-crm-key': env.MPF_CRM_EXPORT_KEY } }));
      } catch (err) {
        if (!env.MPF_ADMIN_EMAIL) throw err;
        logger.warn({ err: err.message }, 'MPF crm-export failed; falling back to admin login');
      }
    }
    // Fallback: same list the MPF admin panel uses (SUPERADMIN login -> JWT -> GET /enquiry/get-all).
    if (!env.MPF_ADMIN_EMAIL || !env.MPF_ADMIN_PASSWORD) throw new AppError('Set MPF_CRM_EXPORT_KEY (or MPF_ADMIN_EMAIL/MPF_ADMIN_PASSWORD) to sync MPF', { status: 400, errorCode: 'SYNC_NOT_CONFIGURED' });
    const login = await fetch(`${base}/admin-portal/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.MPF_ADMIN_EMAIL, password: env.MPF_ADMIN_PASSWORD }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const auth = await login.json().catch(() => ({}));
    if (!login.ok || !auth.token) throw new AppError(`MPF admin login failed (${login.status})${auth.message ? `: ${auth.message}` : ''}`, { status: 502, errorCode: 'SOURCE_AUTH_FAILED' });
    return asRows(await getJson(`${base}/enquiry/get-all`, { headers: { Authorization: `Bearer ${auth.token}`, cookie: `token=${auth.token}` } }));
  },

  async RMW() {
    if (!env.RMW_ENQUIRY_LIST_URL) throw new AppError('Set RMW_ENQUIRY_LIST_URL to sync RMW', { status: 400, errorCode: 'SYNC_NOT_CONFIGURED' });
    const rows = await getJson(env.RMW_ENQUIRY_LIST_URL);
    return Array.isArray(rows) ? rows : rows?.data || [];
  },

  async CT() {
    if (!env.CT_API_URL || !env.CT_ADMIN_EMAIL || !env.CT_ADMIN_PASSWORD) throw new AppError('Set CT_API_URL, CT_ADMIN_EMAIL and CT_ADMIN_PASSWORD to sync CT', { status: 400, errorCode: 'SYNC_NOT_CONFIGURED' });
    const base = env.CT_API_URL.replace(/\/$/, '');
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.CT_ADMIN_EMAIL, password: env.CT_ADMIN_PASSWORD }), signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('ct_admin_token='));
    if (!login.ok || !cookie) throw new AppError(`CT admin login failed (${login.status})`, { status: 502, errorCode: 'SOURCE_AUTH_FAILED' });
    const all = [];
    for (let page = 1; page <= 500; page += 1) {
      const body = await getJson(`${base}/api/leads?page=${page}&limit=100`, { headers: { cookie } });
      const data = body?.data || body;
      const leads = data?.leads || [];
      all.push(...leads);
      const totalPages = data?.pagination?.totalPages ?? data?.pagination?.pages ?? (leads.length < 100 ? page : page + 1);
      if (!leads.length || page >= totalPages) break;
    }
    return all;
  },
};

/**
 * Sync one website. Incremental by default: only enquiries not yet in the CRM are written (one lookup query for
 * existing ids), so a run with nothing new costs a single API call + one SELECT. Pass { full: true } to re-upsert all.
 */
export async function syncWebsite(code, { full = false } = {}) {
  const website = await one('SELECT id, code, domain, external_id_prefix FROM websites WHERE code = ? AND is_active = 1', [code]);
  if (!website) throw new AppError(`Website ${code} not found or inactive`, { status: 404, errorCode: 'NOT_FOUND' });
  const started = Date.now();
  const result = { website: code, fetched: 0, created: 0, updated: 0, junk: 0, failed: 0, errors: [] };
  try {
    const rows = await FETCHERS[code]();
    result.fetched = rows.length;
    const adapter = getAdapter(code);
    // Oldest first, so repeat submissions are detected against the original enquiry.
    const items = rows.map((row) => { try { return { row, c: adapter.normalize(row) }; } catch (err) { return { row, err }; } });
    if (!full) {
      const have = new Set((await query('SELECT external_lead_id FROM leads WHERE website_id = ?', [website.id])).map((r) => r.external_lead_id));
      const fresh = items.filter((it) => it.err || !have.has(`${website.external_id_prefix}-${it.c.externalRawId}`));
      result.skipped = items.length - fresh.length;
      items.length = 0; items.push(...fresh);
    }
    items.sort((a, b) => (a.c?.externalCreatedAt?.getTime() ?? 0) - (b.c?.externalCreatedAt?.getTime() ?? 0));
    for (const { row, c, err: normErr } of items) {
      try {
        if (normErr) throw normErr;
        c.raw = row;
        const src = String(row.status || '').trim().toLowerCase();
        c.initialStatusCode = STATUS_MAP[code][src] || null;
        const r = await upsertCanonicalLead(website, c, { silent: true });
        if (r.created) result.created += 1; else result.updated += 1;
        if (r.junk) result.junk += 1;
      } catch (err) {
        result.failed += 1;
        if (result.errors.length < 10) result.errors.push({ id: row?.id ?? row?.externalId ?? null, error: err.message });
      }
    }
    await query('UPDATE website_integrations SET last_received_at = NOW(3), last_success_at = NOW(3), success_count = success_count + ? WHERE website_id = ?', [result.created, website.id]);
  } catch (err) {
    await query('UPDATE website_integrations SET last_failure_at = NOW(3), last_error = ?, failure_count = failure_count + 1 WHERE website_id = ?', [`Sync: ${err.message}`.slice(0, 1000), website.id]);
    throw err;
  } finally {
    result.ms = Date.now() - started;
  }
  logger.info({ ...result, errors: result.errors.length }, `Pull sync ${code} finished`);
  return result;
}

export async function syncAll() {
  const out = [];
  for (const code of ['MPF', 'RMW', 'CT']) {
    try { out.push(await syncWebsite(code)); } catch (err) { out.push({ website: code, error: err.message }); }
  }
  return out;
}
