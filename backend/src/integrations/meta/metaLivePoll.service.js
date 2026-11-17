import { query } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { LEAD_SOURCE_TYPES } from '../../config/leadSources.js';
import { graphPaged } from './metaApi.service.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { metaAssets, fetchPageForms } from './metaAsset.service.js';
import { LEAD_FIELDS_FULL, LEAD_FIELDS_BASIC, importMetaLead } from './metaLead.service.js';
import { leadsSinceFilter } from './metaSync.service.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { PROVIDER } from './meta.config.js';

const OVERLAP_MS = 10 * 60_000;       
const FIRST_WINDOW_MS = 60 * 60_000;   
const FORMS_REFRESH_MS = 15 * 60_000;  

let lastPollAt = null;
let lastFormsRefresh = 0;
let running = false;

async function formLeads(formId, token, since) {
  const params = { fields: LEAD_FIELDS_FULL, limit: 100, filtering: leadsSinceFilter(since) };
  try {
    return await graphPaged(`${formId}/leads`, { token, params, maxPages: 5 });
  } catch (err) {
    if (err.isPermissionError || err.errorCode === 'META_INVALID_REQUEST') {
      return graphPaged(`${formId}/leads`, { token, params: { ...params, fields: LEAD_FIELDS_BASIC }, maxPages: 5 });
    }
    throw err;
  }
}

/** One poll tick. Returns { imported } or null when skipped. */
export async function pollMetaLeadsOnce() {
  if (running) return null;
  running = true;
  const tickStart = Date.now();
  try {
    const conn = await repo.current();
    if (!conn || conn.status !== 'ACTIVE' || conn.sync_started_at) return null;

    const since = new Date((lastPollAt ?? tickStart - FIRST_WINDOW_MS) - OVERLAP_MS);
    const pages = await query("SELECT external_id FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND is_selected = 1", [conn.id]);
    const refreshForms = tickStart - lastFormsRefresh > FORMS_REFRESH_MS;
    let imported = 0;

    for (const { external_id: pageId } of pages) {
      const page = await repo.pageWithToken(pageId);
      if (!page?.token) continue;

      if (refreshForms) {
        try { await metaAssets.upsertForms(conn.id, pageId, await fetchPageForms(pageId, page.token)); } catch (err) {
          if (err.isTokenError) throw err;
        }
      }
      const forms = await query("SELECT form_id FROM meta_forms WHERE page_id = ? AND (status IS NULL OR status = 'ACTIVE')", [pageId]);

      for (const { form_id: formId } of forms) {
        let leads;
        try { leads = await formLeads(formId, page.token, since); } catch (err) {
          if (err.isTokenError) throw err;
          continue;
        }
        if (!leads.length) continue;
        const ids = leads.map((l) => String(l.id));
        const have = new Set((await query('SELECT source_lead_id FROM leads WHERE source_type = ? AND source_lead_id IN (?)', [LEAD_SOURCE_TYPES.META, ids])).map((r) => r.source_lead_id));

        for (const lead of leads.sort((a, b) => new Date(a.created_time) - new Date(b.created_time))) {
          if (have.has(String(lead.id))) continue;
          try {
            const res = await importMetaLead(page, lead); // not silent → NEW_LEAD socket event + notification
            if (res.created) imported += 1;
            await query(
              `INSERT INTO meta_webhook_events (leadgen_id, page_id, form_id, ad_id, source, status, payload, lead_id, attempts, processed_at)
               VALUES (?, ?, ?, ?, 'SYNC', ?, ?, ?, 1, NOW(3))
               ON DUPLICATE KEY UPDATE status = IF(status IN ('FAILED','RECEIVED'), 'PROCESSED', status), lead_id = COALESCE(lead_id, VALUES(lead_id)), error = NULL`,
              [String(lead.id), pageId, lead.form_id || formId, lead.ad_id || null, res.created ? 'PROCESSED' : 'DUPLICATE', JSON.stringify({ leadgenId: String(lead.id), via: 'live-poll' }), res.leadId],
            );
          } catch (err) {
            if (err.isTokenError) throw err;
            logger.warn({ err: err.message, leadgenId: lead.id }, 'Meta live poll: lead import failed');
          }
        }
      }
    }

    if (refreshForms) lastFormsRefresh = tickStart;
    lastPollAt = tickStart;
    if (imported) await integrationLog(PROVIDER, 'info', 'LIVE_POLL_IMPORTED', `Live poll imported ${imported} lead(s) the webhook had not delivered`, { imported });
    return { imported };
  } catch (err) {
    logger.error({ err: err.message }, 'Meta live poll failed');
    return null;
  } finally {
    running = false;
  }
}

/** Start the poller. seconds <= 0 disables it. */
export function startMetaLivePoll(seconds) {
  if (!(seconds > 0)) return null;
  const ms = Math.max(30, seconds) * 1000;
  setTimeout(() => pollMetaLeadsOnce(), 20_000);
  logger.info(`Meta live lead poll every ${ms / 1000}s`);
  return setInterval(() => pollMetaLeadsOnce(), ms);
}
