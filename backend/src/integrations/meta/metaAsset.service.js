/**
 * Asset discovery and selection: Business, Facebook Page, Instagram account, Ad account, Lead forms.
 * Page access tokens are fetched server-side at selection time, encrypted, and never returned to the browser.
 */
import { query, one, transaction } from '../../config/db.js';
import { badRequest, conflict } from '../../utils/errors.js';
import { audit } from '../../services/auditService.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { graph, graphPaged } from './metaApi.service.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { metaAuth } from './metaAuth.service.js';
import { PROVIDER } from './meta.config.js';

const META_ID = /^\d{1,32}$/;
const AD_ACCOUNT_ID = /^act_\d{1,32}$/;

async function requireUserToken() {
  const conn = await repo.current();
  if (!conn || conn.status === 'DISCONNECTED') throw conflict('Meta is not connected. Connect Meta first.', 'META_NOT_CONNECTED');
  const token = repo.userToken(conn);
  if (!token) throw conflict('The Meta connection has no valid token. Reconnect Meta.', 'META_TOKEN_INVALID');
  return { conn, token };
}

/** Optional lookups: a missing optional permission yields an empty list plus a warning instead of failing the screen. */
async function optional(warnings, label, fn) {
  try { return await fn(); } catch (err) {
    if (err.isTokenError) throw err;
    warnings.push(`${label}: ${err.message}`);
    return [];
  }
}

async function upsertForms(connectionId, pageId, forms) {
  for (const f of forms) {
    await query(
      `INSERT INTO meta_forms (connection_id, page_id, form_id, name, status, leads_count, questions, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE connection_id = VALUES(connection_id), page_id = VALUES(page_id), name = VALUES(name), status = VALUES(status),
         leads_count = VALUES(leads_count), questions = COALESCE(VALUES(questions), questions), last_synced_at = NOW(3)`,
      [connectionId, pageId, String(f.id), f.name?.slice(0, 255) || null, f.status || null, Number.isFinite(f.leads_count) ? f.leads_count : null,
        f.questions ? JSON.stringify(f.questions.map((q) => ({ key: q.key, label: q.label, type: q.type }))) : null],
    );
  }
}

export async function fetchPageForms(pageId, pageToken) {
  return graphPaged(`${pageId}/leadgen_forms`, { token: pageToken, params: { fields: 'id,name,status,leads_count,questions', limit: 100 }, maxPages: 10 });
}

const PAGE_FIELDS = 'id,name,category,access_token,instagram_business_account{id,username},business{id,name}';
const parseJson = (v) => { if (v == null || typeof v !== 'string') return v || null; try { return JSON.parse(v); } catch { return null; } };

async function subscribePage(pageId, pageToken) {
  const sub = await graph(`${pageId}/subscribed_apps`, { token: pageToken, method: 'POST', params: { subscribed_fields: 'leadgen' } });
  if (!sub?.success) throw badRequest('Meta did not confirm the webhook subscription for this Page', 'META_SUBSCRIBE_FAILED');
}

/** Keep the Page's linked Instagram account in meta_assets (follows the Page's on/off state). */
async function upsertInstagram(connectionId, page, active) {
  const ig = page.instagram_business_account;
  await query("UPDATE meta_assets SET is_selected = 0 WHERE connection_id = ? AND asset_type = 'INSTAGRAM' AND parent_external_id = ?", [connectionId, String(page.id)]);
  if (!ig?.id || !active) return;
  await query(
    `INSERT INTO meta_assets (connection_id, asset_type, external_id, name, parent_external_id, is_selected) VALUES (?, 'INSTAGRAM', ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE name = VALUES(name), parent_external_id = VALUES(parent_external_id), is_selected = 1`,
    [connectionId, String(ig.id), ig.username ? `@${ig.username}` : null, String(page.id)],
  );
}

async function validateRouting(websiteId, assignmentTeamId) {
  if (websiteId && !(await one('SELECT id FROM websites WHERE id = ? AND is_active = 1', [websiteId]))) throw badRequest('Choose a valid website', 'INVALID_WEBSITE');
  if (assignmentTeamId && !(await one('SELECT id FROM teams WHERE id = ? AND is_active = 1', [assignmentTeamId]))) throw badRequest('That team does not exist or is inactive', 'INVALID_TEAM');
}

export const metaAssets = {
  /**
   * Import every Page the connected Meta user manages (one Meta login, all Pages). New Pages start switched off;
   * Pages already switched on get a fresh token and webhook subscription. Pages the user lost access to are switched off.
   * Returns { total, active }.
   */
  async syncPages(connectionId, userToken) {
    const pages = await graphPaged('me/accounts', { token: userToken, params: { fields: PAGE_FIELDS, limit: 100 } });
    // Pages shared through Business Manager (owned or client Pages) are missing from me/accounts when the profile has
    // no direct role on them. List them too; a Page token is only returned when the profile is assigned to the Page.
    try {
      const known = new Set(pages.map((p) => String(p.id)));
      const businesses = await graphPaged('me/businesses', { token: userToken, params: { fields: 'id,name', limit: 100 } });
      for (const b of businesses) {
        for (const edge of ['owned_pages', 'client_pages']) {
          const bp = await graphPaged(`${b.id}/${edge}`, { token: userToken, params: { fields: 'id,name,category', limit: 100 } }).catch(() => []);
          for (const p of bp) {
            if (known.has(String(p.id))) continue;
            known.add(String(p.id));
            const full = await graph(String(p.id), { token: userToken, params: { fields: PAGE_FIELDS } }).catch(() => null);
            pages.push({ ...p, ...(full || {}), business: full?.business || { id: b.id, name: b.name } });
          }
        }
      }
    } catch (err) {
      await integrationLog(PROVIDER, 'warn', 'BUSINESS_PAGES_FAILED', `Could not list Business Manager Pages: ${err.message}`, { connectionId });
    }
    const existing = await query("SELECT external_id, is_selected FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE'", [connectionId]);
    const wasActive = new Set(existing.filter((r) => r.is_selected).map((r) => r.external_id));
    const seen = new Set();
    let active = 0;
    for (const p of pages) {
      const id = String(p.id);
      seen.add(id);
      const meta = { category: p.category || null, businessId: p.business?.id ? String(p.business.id) : null, businessName: p.business?.name || null,
        instagram: p.instagram_business_account?.id ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || null } : null };
      let subscribed = false;
      if (wasActive.has(id) && p.access_token) {
        try { await subscribePage(id, p.access_token); subscribed = true; } catch (err) {
          await integrationLog(PROVIDER, 'warn', 'SUBSCRIBE_FAILED', `Page "${p.name}": ${err.message}`, { connectionId, pageId: id });
        }
      }
      await query(
        `INSERT INTO meta_assets (connection_id, asset_type, external_id, name, access_token_enc, is_selected, webhook_subscribed_at, meta)
         VALUES (?, 'PAGE', ?, ?, ?, 0, NULL, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), access_token_enc = VALUES(access_token_enc), meta = VALUES(meta),
           webhook_subscribed_at = IF(?, NOW(3), webhook_subscribed_at)`,
        [connectionId, id, p.name?.slice(0, 255) || null, p.access_token ? repo.encryptToken(p.access_token) : null, JSON.stringify(meta), subscribed ? 1 : 0],
      );
      if (wasActive.has(id)) { await upsertInstagram(connectionId, p, true); active += 1; }
    }
    const lost = [...wasActive].filter((id) => !seen.has(id));
    if (lost.length) {
      await query(`UPDATE meta_assets SET is_selected = 0, access_token_enc = NULL, webhook_subscribed_at = NULL
        WHERE connection_id = ? AND asset_type = 'PAGE' AND external_id IN (?)`, [connectionId, lost]);
      await integrationLog(PROVIDER, 'warn', 'PAGES_LOST', `${lost.length} Page(s) are no longer accessible and were switched off`, { connectionId, pageIds: lost });
    }
    await integrationLog(PROVIDER, 'info', 'PAGES_SYNCED', `${pages.length} Page(s) found, ${active} active`, { connectionId });
    return { total: pages.length, active };
  },

  /** Every imported Page with its on/off state, routing and lead counts (super admin management list). */
  async listPages() {
    const conn = await repo.current();
    if (!conn || conn.status === 'DISCONNECTED') return { pages: [], defaults: null };
    // Connections made before multi-Page support only hold the one Page chosen then: import the rest once.
    const [{ c: imported }] = await query("SELECT COUNT(*) c FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND meta IS NOT NULL", [conn.id]);
    const userToken = repo.userToken(conn);
    if (!Number(imported) && userToken) {
      await metaAssets.syncPages(conn.id, userToken).catch((err) => metaAuth.recordApiError(conn, err, 'Importing Pages'));
    }
    const rows = await query(
      `SELECT a.external_id, a.name, a.is_selected, a.website_id, w.code website_code, a.assignment_team_id, t.name team_name,
         a.webhook_subscribed_at, a.access_token_enc IS NOT NULL has_token, a.meta,
         (SELECT COUNT(*) FROM meta_forms f WHERE f.page_id = a.external_id) forms_count,
         (SELECT COUNT(*) FROM leads l WHERE l.source_type = 'META' AND l.page_id = a.external_id AND l.merged_into_lead_id IS NULL) leads_count,
         (SELECT MAX(l.created_at) FROM leads l WHERE l.source_type = 'META' AND l.page_id = a.external_id) last_lead_at
       FROM meta_assets a LEFT JOIN websites w ON w.id = a.website_id LEFT JOIN teams t ON t.id = a.assignment_team_id
       WHERE a.connection_id = ? AND a.asset_type = 'PAGE' ORDER BY a.is_selected DESC, a.name`, [conn.id],
    );
    return {
      defaults: { websiteId: conn.website_id, assignmentTeamId: conn.assignment_team_id },
      pages: rows.map((r) => {
        const m = parseJson(r.meta) || {};
        return {
          id: r.external_id, name: r.name, active: Boolean(r.is_selected), hasToken: Boolean(r.has_token),
          webhookSubscribed: Boolean(r.webhook_subscribed_at), category: m.category || null, businessName: m.businessName || null,
          instagram: m.instagram || null,
          website: r.website_id ? { id: r.website_id, code: r.website_code } : null,
          assignmentTeam: r.assignment_team_id ? { id: r.assignment_team_id, name: r.team_name } : null,
          formsCount: Number(r.forms_count || 0), leadsCount: Number(r.leads_count || 0), lastLeadAt: r.last_lead_at,
        };
      }),
    };
  },

  /** Re-read the Page list from Meta (new Pages added to the account show up without reconnecting). */
  async refreshPages(req) {
    const { conn, token } = await requireUserToken();
    try {
      const r = await metaAssets.syncPages(conn.id, token);
      await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', entityId: conn.id, req, meta: { action: 'meta_refresh_pages', ...r } });
      return r;
    } catch (err) {
      await metaAuth.recordApiError(conn, err, 'Refreshing Pages');
      throw err;
    }
  },

  /**
   * Switch a Page on/off and/or set its pipeline + team. On: subscribes the leadgen webhook and detects forms.
   * Off: unsubscribes; existing leads stay. websiteId / assignmentTeamId: undefined = unchanged, null = connection default.
   */
  async updatePage(req, pageId, { active, websiteId, assignmentTeamId }) {
    if (!META_ID.test(String(pageId || ''))) throw badRequest('Invalid Page id', 'META_INVALID_PAGE');
    const { conn, token } = await requireUserToken();
    const row = await one("SELECT * FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND external_id = ?", [conn.id, pageId]);
    if (!row) throw badRequest('That Page is not in the list. Click "Refresh Pages" first.', 'META_INVALID_PAGE');
    await validateRouting(websiteId, assignmentTeamId);

    const effectiveWebsite = websiteId !== undefined ? websiteId || conn.website_id : row.website_id || conn.website_id;
    let formsCount = null;
    if (active === true && !row.is_selected) {
      if (!effectiveWebsite) throw badRequest('Choose the CRM pipeline for this Page first', 'META_NO_WEBSITE');
      try {
        const page = await graph(pageId, { token, params: { fields: 'id,name,access_token,instagram_business_account{id,username}' } });
        if (!page?.access_token) throw badRequest('You do not have a role on this Page that allows reading leads', 'META_INVALID_PAGE');
        await subscribePage(pageId, page.access_token);
        await query('UPDATE meta_assets SET is_selected = 1, name = ?, access_token_enc = ?, webhook_subscribed_at = NOW(3) WHERE id = ?',
          [page.name?.slice(0, 255) || row.name, repo.encryptToken(page.access_token), row.id]);
        await upsertInstagram(conn.id, page, true);
        try {
          const forms = await fetchPageForms(pageId, page.access_token);
          await upsertForms(conn.id, pageId, forms);
          formsCount = forms.length;
        } catch (err) {
          await integrationLog(PROVIDER, 'warn', 'FORMS_FAILED', `Could not list lead forms for "${page.name}": ${err.message}`, { connectionId: conn.id, pageId });
        }
      } catch (err) {
        if (err.name === 'MetaApiError') await metaAuth.recordApiError(conn, err, `Switching on Page ${pageId}`);
        throw err;
      }
    } else if (active === false && row.is_selected) {
      const pageToken = repo.pageTokenFromRow(row);
      if (pageToken) {
        try { await graph(`${pageId}/subscribed_apps`, { token: pageToken, method: 'DELETE' }); } catch (err) {
          await integrationLog(PROVIDER, 'warn', 'UNSUBSCRIBE_FAILED', `Page ${pageId}: ${err.message}`, { connectionId: conn.id, pageId });
        }
      }
      await query('UPDATE meta_assets SET is_selected = 0, webhook_subscribed_at = NULL WHERE id = ?', [row.id]);
      await upsertInstagram(conn.id, { id: pageId }, false);
    }

    if (websiteId !== undefined || assignmentTeamId !== undefined) {
      await query('UPDATE meta_assets SET website_id = ?, assignment_team_id = ? WHERE id = ?', [
        websiteId === undefined ? row.website_id : websiteId || null,
        assignmentTeamId === undefined ? row.assignment_team_id : assignmentTeamId || null, row.id,
      ]);
    }

    // The connection is ACTIVE while at least one Page is on.
    const [{ c: activeCount }] = await query("SELECT COUNT(*) c FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND is_selected = 1", [conn.id]);
    if (!conn.website_id && effectiveWebsite) await query('UPDATE meta_connections SET website_id = ? WHERE id = ?', [effectiveWebsite, conn.id]);
    if (conn.status !== 'ERROR') await repo.setStatus(conn.id, Number(activeCount) > 0 ? 'ACTIVE' : 'PENDING_SETUP');

    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', entityId: conn.id, req, meta: { action: 'meta_update_page', pageId, active, websiteId, assignmentTeamId } });
    await integrationLog(PROVIDER, 'info', 'PAGE_UPDATED', `Page "${row.name}" ${active === true ? 'switched on' : active === false ? 'switched off' : 'updated'}`, { connectionId: conn.id, pageId, formsCount });
    return { activePages: Number(activeCount), formsCount };
  },

  /** Active Pages only, no tokens: the Page switcher on dashboards and analytics. */
  async activePages() {
    const conn = await repo.current();
    if (!conn || conn.status === 'DISCONNECTED') return [];
    const rows = await query("SELECT external_id id, name FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND is_selected = 1 ORDER BY name", [conn.id]);
    return rows.map((r) => ({ id: r.id, name: r.name }));
  },

  /** Everything the connected Meta user can choose from. No tokens in the response. */
  async listAvailable() {
    const { conn, token } = await requireUserToken();
    const warnings = [];
    try {
      const pages = await graphPaged('me/accounts', {
        token, params: { fields: 'id,name,category,tasks,instagram_business_account,business{id,name}', limit: 100 },
      });
      const [businesses, adAccounts] = await Promise.all([
        optional(warnings, 'Businesses', () => graphPaged('me/businesses', { token, params: { fields: 'id,name', limit: 100 } })),
        optional(warnings, 'Ad accounts', () => graphPaged('me/adaccounts', { token, params: { fields: 'id,account_id,name,currency,account_status,business{id,name}', limit: 100 } })),
      ]);
      const selected = await repo.selectedAssets(conn.id);
      const sel = (type) => selected.find((a) => a.asset_type === type)?.external_id || null;
      return {
        businesses: businesses.map((b) => ({ id: String(b.id), name: b.name })),
        pages: pages.map((p) => ({
          id: String(p.id), name: p.name, category: p.category || null, tasks: p.tasks || [], businessId: p.business?.id ? String(p.business.id) : null,
          instagram: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || p.instagram_business_account.name || null } : null,
        })),
        adAccounts: adAccounts.map((a) => ({
          id: String(a.id), accountId: String(a.account_id), name: a.name, currency: a.currency || null, status: a.account_status ?? null,
          businessId: a.business?.id ? String(a.business.id) : null,
        })),
        selected: { businessId: sel('BUSINESS'), pageId: sel('PAGE'), instagramId: sel('INSTAGRAM'), adAccountId: sel('AD_ACCOUNT'), websiteId: conn.website_id, assignmentTeamId: conn.assignment_team_id },
        warnings,
      };
    } catch (err) {
      await metaAuth.recordApiError(conn, err, 'Listing Meta assets');
      throw err;
    }
  },

  /** Lead forms on one Page (for "12 forms detected" in the selector). */
  async listForms(pageId) {
    if (!META_ID.test(String(pageId || ''))) throw badRequest('Invalid Page id', 'META_INVALID_PAGE');
    const { conn, token } = await requireUserToken();
    try {
      const page = await graph(String(pageId), { token, params: { fields: 'access_token' } });
      if (!page?.access_token) throw badRequest('You do not manage this Page', 'META_INVALID_PAGE');
      const forms = await fetchPageForms(pageId, page.access_token);
      return forms.map((f) => ({ id: String(f.id), name: f.name, status: f.status || null, leadsCount: f.leads_count ?? null }));
    } catch (err) {
      await metaAuth.recordApiError(conn, err, 'Listing lead forms');
      throw err;
    }
  },

  /**
   * Save the selection, subscribe the Page to the leadgen webhook and activate the connection.
   * Every id is re-validated against what this Meta user can actually access.
   */
  async select(req, { businessId, pageId, instagramId, adAccountId, websiteId, assignmentTeamId }) {
    const { conn, token } = await requireUserToken();
    if (!META_ID.test(pageId)) throw badRequest('Choose a Facebook Page', 'META_INVALID_PAGE');
    if (businessId && !META_ID.test(businessId)) throw badRequest('Invalid Business id', 'META_INVALID_BUSINESS');
    if (instagramId && !META_ID.test(instagramId)) throw badRequest('Invalid Instagram account id', 'META_INVALID_INSTAGRAM');
    if (adAccountId && !AD_ACCOUNT_ID.test(adAccountId)) throw badRequest('Invalid Ad account id', 'META_INVALID_AD_ACCOUNT');

    const website = await one('SELECT id, code FROM websites WHERE id = ? AND is_active = 1', [websiteId]);
    if (!website) throw badRequest('Choose the CRM website these leads belong to', 'INVALID_WEBSITE');
    if (assignmentTeamId) {
      const team = await one('SELECT id FROM teams WHERE id = ? AND is_active = 1', [assignmentTeamId]);
      if (!team) throw badRequest('That team does not exist or is inactive', 'INVALID_TEAM');
    }

    let page; let business = null; let adAccount = null;
    try {
      page = await graph(pageId, { token, params: { fields: 'id,name,access_token,instagram_business_account' } });
      if (!page?.access_token) throw badRequest('You do not have a role on this Page that allows reading leads', 'META_INVALID_PAGE');
      if (instagramId && String(page.instagram_business_account?.id || '') !== instagramId) {
        throw badRequest('That Instagram account is not linked to the selected Page', 'META_INVALID_INSTAGRAM');
      }
      if (businessId) business = await graph(businessId, { token, params: { fields: 'id,name' } });
      if (adAccountId) adAccount = await graph(adAccountId, { token, params: { fields: 'id,name,currency,account_id' } });
      // Subscribe the Page to this app's leadgen webhook (requires pages_manage_metadata).
      const sub = await graph(`${pageId}/subscribed_apps`, { token: page.access_token, method: 'POST', params: { subscribed_fields: 'leadgen' } });
      if (!sub?.success) throw badRequest('Meta did not confirm the webhook subscription for this Page', 'META_SUBSCRIBE_FAILED');
    } catch (err) {
      if (err.name === 'MetaApiError') {
        await metaAuth.recordApiError(conn, err, 'Saving Meta selection');
        if (err.metaCode === 100) throw badRequest('Meta rejected one of the selected assets. Check you still have access to it.', 'META_INVALID_ASSET');
      }
      throw err;
    }

    await transaction(async (c) => {
      // Other Pages (multi-Page) are kept: only the Business / Ad account are replaced; this Page is switched on.
      await c.query("DELETE FROM meta_assets WHERE connection_id = ? AND asset_type IN ('BUSINESS','AD_ACCOUNT')", [conn.id]);
      const insert = (type, id, name, extra = {}) => c.query(
        `INSERT INTO meta_assets (connection_id, asset_type, external_id, name, parent_external_id, access_token_enc, is_selected, webhook_subscribed_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), parent_external_id = VALUES(parent_external_id), is_selected = 1,
           access_token_enc = COALESCE(VALUES(access_token_enc), access_token_enc), webhook_subscribed_at = COALESCE(VALUES(webhook_subscribed_at), webhook_subscribed_at),
           meta = COALESCE(VALUES(meta), meta)`,
        [conn.id, type, id, name?.slice(0, 255) || null, extra.parent || null, extra.tokenEnc || null, extra.subscribed ? new Date() : null, extra.meta ? JSON.stringify(extra.meta) : null],
      );
      await insert('PAGE', String(page.id), page.name, { tokenEnc: repo.encryptToken(page.access_token), subscribed: true });
      await c.query("UPDATE meta_assets SET is_selected = 0 WHERE connection_id = ? AND asset_type = 'INSTAGRAM' AND parent_external_id = ?", [conn.id, String(page.id)]);
      if (instagramId) await insert('INSTAGRAM', instagramId, page.instagram_business_account?.username ? `@${page.instagram_business_account.username}` : null, { parent: String(page.id) });
      if (business) await insert('BUSINESS', String(business.id), business.name);
      if (adAccount) await insert('AD_ACCOUNT', String(adAccount.id), adAccount.name, { meta: { currency: adAccount.currency || null } });
      await c.query(
        `UPDATE meta_connections SET website_id = ?, assignment_team_id = ?, status = 'ACTIVE', last_error_code = NULL, last_error = NULL, last_error_at = NULL WHERE id = ?`,
        [website.id, assignmentTeamId || null, conn.id],
      );
    });

    let formsCount = 0;
    try {
      const forms = await fetchPageForms(page.id, page.access_token);
      await upsertForms(conn.id, String(page.id), forms);
      formsCount = forms.length;
    } catch (err) {
      await integrationLog(PROVIDER, 'warn', 'FORMS_FAILED', `Could not list lead forms: ${err.message}`, { connectionId: conn.id, errorCode: err.errorCode });
    }

    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', entityId: conn.id, req, meta: { action: 'meta_select_assets', pageId, adAccountId, websiteId: website.id } });
    await integrationLog(PROVIDER, 'info', 'ASSETS_SELECTED', `Page "${page.name}" connected to ${website.code}; webhook subscribed`, { connectionId: conn.id, pageId, adAccountId: adAccountId || null, formsCount });
    return { status: 'ACTIVE', formsCount };
  },

  /** Lead routing settings that don't touch Meta. */
  async updateSettings(req, { websiteId, assignmentTeamId }) {
    const conn = await repo.current();
    if (!conn || conn.status === 'DISCONNECTED') throw conflict('Meta is not connected', 'META_NOT_CONNECTED');
    if (websiteId) {
      const w = await one('SELECT id FROM websites WHERE id = ? AND is_active = 1', [websiteId]);
      if (!w) throw badRequest('Choose a valid website', 'INVALID_WEBSITE');
    }
    if (assignmentTeamId) {
      const t = await one('SELECT id FROM teams WHERE id = ? AND is_active = 1', [assignmentTeamId]);
      if (!t) throw badRequest('That team does not exist or is inactive', 'INVALID_TEAM');
    }
    await query('UPDATE meta_connections SET website_id = COALESCE(?, website_id), assignment_team_id = ? WHERE id = ?',
      [websiteId || null, assignmentTeamId === undefined ? conn.assignment_team_id : assignmentTeamId || null, conn.id]);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', entityId: conn.id, req, meta: { action: 'meta_settings', websiteId, assignmentTeamId } });
  },

  /** After a reconnect, re-derive the selected Pages' tokens from the new user token. Returns true if a Page is ready. */
  async refreshPageTokens(connectionId, userToken) {
    const pages = await query("SELECT id, external_id FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND is_selected = 1", [connectionId]);
    if (!pages.length) return false;
    let ok = 0;
    for (const p of pages) {
      const page = await graph(p.external_id, { token: userToken, params: { fields: 'id,access_token' } });
      if (!page?.access_token) continue;
      await graph(`${p.external_id}/subscribed_apps`, { token: page.access_token, method: 'POST', params: { subscribed_fields: 'leadgen' } });
      await query('UPDATE meta_assets SET access_token_enc = ?, webhook_subscribed_at = NOW(3) WHERE id = ?', [repo.encryptToken(page.access_token), p.id]);
      ok += 1;
    }
    return ok > 0;
  },

  upsertForms,
};
