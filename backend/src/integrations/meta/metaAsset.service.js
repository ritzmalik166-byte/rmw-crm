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

export const metaAssets = {
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
      await c.query('DELETE FROM meta_assets WHERE connection_id = ?', [conn.id]);
      const insert = (type, id, name, extra = {}) => c.query(
        `INSERT INTO meta_assets (connection_id, asset_type, external_id, name, parent_external_id, access_token_enc, webhook_subscribed_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [conn.id, type, id, name?.slice(0, 255) || null, extra.parent || null, extra.tokenEnc || null, extra.subscribed ? new Date() : null, extra.meta ? JSON.stringify(extra.meta) : null],
      );
      await insert('PAGE', String(page.id), page.name, { tokenEnc: repo.encryptToken(page.access_token), subscribed: true });
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
