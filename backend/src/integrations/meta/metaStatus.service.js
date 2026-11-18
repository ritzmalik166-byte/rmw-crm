/** Connection health for the Integrations page: connection, Page, ad account, webhook, API, token, last sync. */
import { query } from '../../config/db.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { metaAuth, missingScopes } from './metaAuth.service.js';
import { isMetaConfigured, isWebhookConfigured, missingConfig, graphVersion } from './meta.config.js';

const parse = (v, d) => { if (v == null) return d; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return d; } };

/** UI state: NOT_CONFIGURED | NOT_CONNECTED | SETUP_REQUIRED | CONNECTED | ERROR. Pure; exported for tests. */
export function connectionState(conn, { configured, tokenValid }) {
  if (!configured) return 'NOT_CONFIGURED';
  if (!conn || conn.status === 'DISCONNECTED') return 'NOT_CONNECTED';
  if (conn.status === 'ERROR' || tokenValid === false) return 'ERROR';
  if (conn.status === 'PENDING_SETUP') return 'SETUP_REQUIRED';
  return 'CONNECTED';
}

export async function metaStatus({ checkToken = true } = {}) {
  const configured = isMetaConfigured();
  const base = { configured, missingConfig: missingConfig(), webhookConfigured: isWebhookConfigured(), apiVersion: graphVersion() };
  let conn = await repo.current();
  if (!conn || conn.status === 'DISCONNECTED') {
    return { ...base, state: connectionState(conn, { configured }), connection: null, disconnectedAt: conn?.disconnected_at || null };
  }

  const token = configured && checkToken ? await metaAuth.checkToken(conn) : null;
  conn = await repo.current(); // pick up any error the token check recorded
  const pub = await repo.currentPublic();
  const assets = await repo.selectedAssets(conn.id);
  const asset = (t) => assets.find((a) => a.asset_type === t) || null;
  const activePages = assets.filter((a) => a.asset_type === 'PAGE');
  const page = activePages[0] || null;
  const [pageCounts] = await query("SELECT COUNT(*) total FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE'", [conn.id]);
  const allSubscribed = activePages.length > 0 && activePages.every((p) => p.webhook_subscribed_at);
  const [forms] = await query('SELECT COUNT(*) c FROM meta_forms WHERE connection_id = ?', [conn.id]);
  const [events] = await query(
    `SELECT SUM(status = 'FAILED') failed, SUM(status IN ('RECEIVED','PROCESSING')) pending,
            SUM(created_at > NOW(3) - INTERVAL 1 DAY) last24h FROM meta_webhook_events`,
  );
  const [leads] = await query("SELECT COUNT(*) total, SUM(created_at > NOW(3) - INTERVAL 1 DAY) last24h FROM leads WHERE source_type = 'META'");
  const scopes = parse(pub.granted_scopes, []);
  const tokenValid = token ? token.valid : pub.token_valid == null ? null : Boolean(pub.token_valid);

  return {
    ...base,
    state: connectionState(conn, { configured, tokenValid }),
    connection: {
      id: pub.id, status: pub.status, metaUserName: pub.meta_user_name,
      connectedAt: pub.connected_at, connectedBy: pub.connected_by_name,
      website: pub.website_id ? { id: pub.website_id, code: pub.website_code, name: pub.website_name } : null,
      assignmentTeam: pub.assignment_team_id ? { id: pub.assignment_team_id, name: pub.assignment_team_name } : null,
      business: asset('BUSINESS') && { id: asset('BUSINESS').external_id, name: asset('BUSINESS').name },
      page: page && { id: page.external_id, name: page.name, webhookSubscribed: Boolean(page.webhook_subscribed_at), subscribedAt: page.webhook_subscribed_at },
      pages: activePages.map((p) => ({ id: p.external_id, name: p.name, webhookSubscribed: Boolean(p.webhook_subscribed_at) })),
      pagesAvailable: Number(pageCounts?.total || 0),
      instagram: asset('INSTAGRAM') && { id: asset('INSTAGRAM').external_id, name: asset('INSTAGRAM').name },
      adAccount: asset('AD_ACCOUNT') && { id: asset('AD_ACCOUNT').external_id, name: asset('AD_ACCOUNT').name },
      formsCount: Number(forms?.c || 0),
    },
    health: {
      token: { valid: tokenValid, expiresAt: pub.token_expires_at, checkedAt: pub.token_checked_at, missingScopes: missingScopes(scopes) },
      api: { ok: token ? !token.apiError : null, error: token?.apiError || null },
      webhook: { subscribed: allSubscribed, configured: base.webhookConfigured, lastReceivedAt: pub.last_webhook_at },
      lastLeadAt: pub.last_lead_at,
      events: { failed: Number(events?.failed || 0), pending: Number(events?.pending || 0), last24h: Number(events?.last24h || 0) },
      leads: { total: Number(leads?.total || 0), last24h: Number(leads?.last24h || 0) },
    },
    sync: {
      running: Boolean(pub.sync_started_at && Date.now() - new Date(pub.sync_started_at).getTime() < 15 * 60_000),
      lastSyncAt: pub.last_sync_at, status: pub.last_sync_status, stats: parse(pub.last_sync_stats, null),
    },
    error: pub.last_error ? { code: pub.last_error_code, message: pub.last_error, at: pub.last_error_at } : null,
  };
}
