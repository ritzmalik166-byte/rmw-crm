/**
 * Manual / scheduled reconciliation. Webhooks are the real-time path; this catches anything they missed:
 *   1. refresh lead forms of the connected Page
 *   2. pull leads created since the last sync (Meta keeps leads for 90 days) and import any the CRM doesn't have
 *   3. pull daily campaign spend (Insights API) for cost per lead, when an ad account is selected
 */
import { query } from '../../config/db.js';
import { conflict } from '../../utils/errors.js';
import { enqueue } from '../../workers/queues.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { LEAD_SOURCE_TYPES } from '../../config/leadSources.js';
import { graphPaged } from './metaApi.service.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { metaAuth } from './metaAuth.service.js';
import { metaAssets, fetchPageForms } from './metaAsset.service.js';
import { LEAD_FIELDS_FULL, LEAD_FIELDS_BASIC, importMetaLead } from './metaLead.service.js';
import { PROVIDER } from './meta.config.js';

const FIRST_SYNC_DAYS = 30;
const OVERLAP_MS = 6 * 3600_000; // re-scan 6h before the last sync to cover webhook gaps
const MAX_PAGES_PER_FORM = 50; // x100 leads
const INSIGHT_DAYS = 30;
const LOCK_MINUTES = 15;

const ymd = (d) => d.toISOString().slice(0, 10);

/** Graph `filtering` value: leads created after a unix timestamp. Exported for tests. */
export function leadsSinceFilter(since) {
  return [{ field: 'time_created', operator: 'GREATER_THAN', value: Math.floor(new Date(since).getTime() / 1000) }];
}

export function syncWindowStart(lastSyncAt, now = new Date()) {
  const first = new Date(now.getTime() - FIRST_SYNC_DAYS * 86400_000);
  if (!lastSyncAt) return first;
  const t = new Date(new Date(lastSyncAt).getTime() - OVERLAP_MS);
  return t < first ? first : t;
}

async function fetchFormLeads(formId, token, since) {
  const params = { fields: LEAD_FIELDS_FULL, limit: 100, filtering: leadsSinceFilter(since) };
  try {
    return await graphPaged(`${formId}/leads`, { token, params, maxPages: MAX_PAGES_PER_FORM });
  } catch (err) {
    if (err.isPermissionError || err.errorCode === 'META_INVALID_REQUEST') {
      return graphPaged(`${formId}/leads`, { token, params: { ...params, fields: LEAD_FIELDS_BASIC }, maxPages: MAX_PAGES_PER_FORM });
    }
    throw err;
  }
}

async function syncInsights(adAccountId, userToken) {
  const until = new Date();
  const since = new Date(until.getTime() - (INSIGHT_DAYS - 1) * 86400_000);
  const rows = await graphPaged(`${adAccountId}/insights`, {
    token: userToken,
    params: {
      level: 'campaign', time_increment: 1, limit: 500,
      fields: 'campaign_id,campaign_name,spend,impressions,clicks,account_currency,date_start',
      time_range: { since: ymd(since), until: ymd(until) },
    },
    maxPages: 40,
  });
  for (const r of rows) {
    if (!r.campaign_id || !r.date_start) continue;
    await query(
      `INSERT INTO meta_campaigns (campaign_id, ad_account_id, name) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ad_account_id = VALUES(ad_account_id), name = COALESCE(VALUES(name), name)`,
      [String(r.campaign_id), adAccountId, r.campaign_name?.slice(0, 255) || null],
    );
    await query(
      `INSERT INTO meta_campaign_insights (campaign_id, date, spend, currency, impressions, clicks) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE spend = VALUES(spend), currency = VALUES(currency), impressions = VALUES(impressions), clicks = VALUES(clicks)`,
      [String(r.campaign_id), r.date_start, Number(r.spend || 0), r.account_currency || null, Number(r.impressions || 0) || null, Number(r.clicks || 0) || null],
    );
  }
  return rows.length;
}

/** Run a sync now (in this process). Holds a DB lock so two syncs never overlap. */
export async function runMetaSync({ trigger = 'manual', actorId = null } = {}) {
  const conn = await repo.current();
  if (!conn || conn.status === 'DISCONNECTED') throw conflict('Meta is not connected', 'META_NOT_CONNECTED');
  const lock = await query(
    `UPDATE meta_connections SET sync_started_at = NOW(3) WHERE id = ? AND (sync_started_at IS NULL OR sync_started_at < NOW(3) - INTERVAL ${LOCK_MINUTES} MINUTE)`, [conn.id],
  );
  if (!lock.affectedRows) throw conflict('A Meta sync is already running', 'META_SYNC_RUNNING');

  const started = Date.now();
  const since = syncWindowStart(conn.last_sync_at);
  const stats = { trigger, since: since.toISOString(), forms: 0, fetched: 0, imported: 0, duplicatesSkipped: 0, junk: 0, errors: 0, spendRows: 0, warnings: [] };
  await integrationLog(PROVIDER, 'info', 'SYNC_STARTED', `Sync started (${trigger})`, { connectionId: conn.id, since: stats.since, actorId });
  let fatal = null;

  try {
    const pages = await query("SELECT external_id FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND is_selected = 1", [conn.id]);
    if (!pages.length) throw conflict('Select a Facebook Page before syncing', 'META_NO_PAGE');

    for (const { external_id: pageId } of pages) {
      const page = await repo.pageWithToken(pageId);
      if (!page?.token) throw conflict('No Page token stored. Reconnect Meta.', 'META_TOKEN_INVALID');
      const forms = await fetchPageForms(pageId, page.token);
      await metaAssets.upsertForms(conn.id, pageId, forms);
      stats.forms += forms.length;

      for (const form of forms) {
        let leads;
        try {
          leads = await fetchFormLeads(form.id, page.token, since);
        } catch (err) {
          if (err.isTokenError) throw err;
          stats.errors += 1;
          stats.warnings.push(`Form ${form.name || form.id}: ${err.message}`);
          continue;
        }
        stats.fetched += leads.length;
        if (!leads.length) continue;
        // Duplicate priority 1 (Meta lead id): one query per form instead of one per lead.
        const ids = leads.map((l) => String(l.id));
        const have = new Set((await query('SELECT source_lead_id FROM leads WHERE source_type = ? AND source_lead_id IN (?)', [LEAD_SOURCE_TYPES.META, ids])).map((r) => r.source_lead_id));
        for (const lead of leads.sort((a, b) => new Date(a.created_time) - new Date(b.created_time))) {
          if (have.has(String(lead.id))) { stats.duplicatesSkipped += 1; continue; }
          try {
            const res = await importMetaLead(page, lead, { silent: true });
            if (res.created) stats.imported += 1; else stats.duplicatesSkipped += 1;
            if (res.junk) stats.junk += 1;
            await query(
              `INSERT INTO meta_webhook_events (leadgen_id, page_id, form_id, ad_id, source, status, payload, lead_id, attempts, processed_at)
               VALUES (?, ?, ?, ?, 'SYNC', 'PROCESSED', ?, ?, 1, NOW(3))
               ON DUPLICATE KEY UPDATE status = IF(status IN ('FAILED','RECEIVED'), 'PROCESSED', status), lead_id = COALESCE(lead_id, VALUES(lead_id)), error = NULL`,
              [String(lead.id), pageId, lead.form_id || null, lead.ad_id || null, JSON.stringify({ leadgenId: String(lead.id), via: 'sync' }), res.leadId],
            );
          } catch (err) {
            if (err.isTokenError) throw err;
            stats.errors += 1;
            if (stats.warnings.length < 10) stats.warnings.push(`Lead ${lead.id}: ${err.message}`);
          }
        }
      }
    }

    const adAccount = (await query("SELECT external_id FROM meta_assets WHERE connection_id = ? AND asset_type = 'AD_ACCOUNT' AND is_selected = 1", [conn.id]))[0];
    const userToken = repo.userToken(conn);
    if (adAccount && userToken) {
      try { stats.spendRows = await syncInsights(adAccount.external_id, userToken); } catch (err) {
        if (err.isTokenError) throw err;
        stats.warnings.push(`Campaign spend: ${err.message}`);
      }
    }
  } catch (err) {
    fatal = err;
    if (err.name === 'MetaApiError') await metaAuth.recordApiError(conn, err, 'Sync');
  }

  stats.ms = Date.now() - started;
  const status = fatal ? 'FAILED' : stats.errors || stats.warnings.length ? 'PARTIAL' : 'SUCCESS';
  await query(
    'UPDATE meta_connections SET sync_started_at = NULL, last_sync_at = NOW(3), last_sync_status = ?, last_sync_stats = ? WHERE id = ?',
    [status, JSON.stringify({ ...stats, error: fatal ? fatal.message : undefined }), conn.id],
  );
  if (!fatal && conn.status === 'ERROR' && conn.last_error_code !== 'META_TOKEN_INVALID') {
    await query("UPDATE meta_connections SET status = 'ACTIVE', last_error_code = NULL, last_error = NULL WHERE id = ?", [conn.id]);
  }
  await integrationLog(PROVIDER, fatal ? 'error' : stats.errors ? 'warn' : 'info', 'SYNC_COMPLETED',
    fatal ? `Sync failed: ${fatal.message}` : `Sync completed: ${stats.imported} imported, ${stats.duplicatesSkipped} duplicates skipped, ${stats.errors} errors`,
    { connectionId: conn.id, ...stats, warnings: stats.warnings.slice(0, 5) });
  if (fatal) throw fatal;
  return { status, ...stats };
}

export const metaSync = {
  /** Queue a sync and return immediately; the UI polls the status endpoint. */
  async requestSync(actorId) {
    const conn = await repo.current();
    if (!conn || conn.status === 'DISCONNECTED') throw conflict('Meta is not connected', 'META_NOT_CONNECTED');
    if (conn.sync_started_at && Date.now() - new Date(conn.sync_started_at).getTime() < LOCK_MINUTES * 60_000) throw conflict('A Meta sync is already running', 'META_SYNC_RUNNING');
    await enqueue('lead-sync', 'meta-sync', { trigger: 'manual', actorId }, { jobId: `meta-sync-${Date.now()}`, attempts: 1 });
    return { queued: true };
  },

  /** Scheduled fallback (SYNC_INTERVAL_MINUTES). Silently skips when Meta isn't active. */
  async syncIfActive() {
    const conn = await repo.current();
    if (!conn || conn.status !== 'ACTIVE') return null;
    return runMetaSync({ trigger: 'scheduled' });
  },
};
