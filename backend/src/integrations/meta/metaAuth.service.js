/**
 * Meta OAuth (Facebook Login): authorization URL with a single-use state bound to the CRM session, code exchange,
 * long-lived token, token health checks, reconnect and disconnect/revoke.
 */
import { env } from '../../config/env.js';
import { query, one } from '../../config/db.js';
import { sessionRepo } from '../../repositories/authRepo.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { badRequest } from '../../utils/errors.js';
import { audit } from '../../services/auditService.js';
import { integrationLog } from '../../services/integrationLogService.js';
import { graph, appAccessToken, appSecretProof, MetaApiError } from './metaApi.service.js';
import { metaConnectionRepo as repo } from './metaConnection.repo.js';
import { META_SCOPES, REQUIRED_SCOPES, PROVIDER, isMetaConfigured, missingConfig } from './meta.config.js';

const STATE_TTL_MIN = 10;
const TOKEN_CHECK_INTERVAL_MS = 10 * 60_000;

export function assertConfigured() {
  if (!isMetaConfigured()) {
    throw badRequest(`Meta integration is not configured on the server. Missing: ${missingConfig().join(', ')}`, 'META_NOT_CONFIGURED');
  }
}

/** Facebook Login dialog URL. Pure; exported for tests. */
export function buildAuthUrl(state) {
  const url = new URL(`https://www.facebook.com/${env.META_API_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', env.META_APP_ID);
  url.searchParams.set('redirect_uri', env.META_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  if (env.META_LOGIN_CONFIG_ID) {
    // Facebook Login for Business: permissions come from the configuration set up in the app dashboard.
    url.searchParams.set('config_id', env.META_LOGIN_CONFIG_ID);
  } else {
    url.searchParams.set('scope', META_SCOPES.join(','));
    url.searchParams.set('auth_type', 'rerequest'); // re-prompts for permissions the user declined earlier
  }
  return url.toString();
}

/**
 * Validate the callback query string. Returns { code, state } or { error } (user cancelled / Meta error).
 * Pure; exported for tests.
 */
export function parseCallbackQuery(q = {}) {
  const state = typeof q.state === 'string' ? q.state : '';
  if (q.error || q.error_reason) {
    const denied = q.error === 'access_denied' || q.error_reason === 'user_denied';
    return { error: denied ? 'ACCESS_DENIED' : 'OAUTH_ERROR', state };
  }
  const code = typeof q.code === 'string' ? q.code : '';
  if (!code || code.length > 2048 || !/^[A-Za-z0-9_\-#.=]+$/.test(code)) return { error: 'INVALID_CODE', state };
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(state)) return { error: 'INVALID_STATE', state };
  return { code, state };
}

export function missingScopes(granted = []) {
  const g = new Set(granted);
  return META_SCOPES.filter((s) => !g.has(s));
}

/** Exchange the OAuth code for a short-lived token, then for a long-lived (~60 day) user token. */
export async function exchangeCodeForToken(code) {
  const short = await graph('oauth/access_token', {
    params: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: env.META_REDIRECT_URI, code },
  });
  if (!short?.access_token) throw new MetaApiError('Meta did not return an access token', { errorCode: 'META_API_ERROR' });
  // Long-lived exchange is best effort: Facebook Login for Business tokens may already be long-lived.
  const long = await graph('oauth/access_token', {
    params: { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token },
  }).catch(() => null);
  const token = long?.access_token || short.access_token;
  const expiresIn = Number(long?.expires_in || short.expires_in || 0);
  return { token, expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null };
}

/** Ask Meta whether a user token is valid, when it expires and which scopes it carries. */
export async function inspectToken(token) {
  // App token + its appsecret_proof: required when "Require app secret" is on in the Meta app.
  const appToken = appAccessToken();
  const body = await graph('debug_token', { params: { input_token: token, access_token: appToken, appsecret_proof: appSecretProof(appToken) } });
  const d = body?.data || {};
  return {
    valid: Boolean(d.is_valid) && String(d.app_id) === String(env.META_APP_ID),
    expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null, // 0 = never expires
    scopes: Array.isArray(d.scopes) ? d.scopes : [],
    userId: d.user_id ? String(d.user_id) : null,
  };
}

export const metaAuth = {
  /** Step 1: store a state bound to this session and return the Facebook dialog URL. */
  async createAuthorization(req) {
    assertConfigured();
    const state = randomToken(32);
    await query('DELETE FROM meta_oauth_states WHERE expires_at < NOW(3) OR used_at IS NOT NULL');
    await query(
      `INSERT INTO meta_oauth_states (state_hash, user_id, session_id, expires_at) VALUES (?, ?, ?, NOW(3) + INTERVAL ${STATE_TTL_MIN} MINUTE)`,
      [sha256(state), req.auth.user.id, req.auth.session.id],
    );
    await integrationLog(PROVIDER, 'info', 'OAUTH_STARTED', 'OAuth started', { userId: req.auth.user.id });
    return { url: buildAuthUrl(state) };
  },

  /**
   * Step 2: the browser returns from Facebook. Validates state (single use, unexpired, same CRM session), exchanges
   * the code, stores the encrypted long-lived token and refreshes Page tokens if Pages were already selected.
   * Returns { ok, reason } for the redirect back to the CRM; never throws to the browser.
   */
  async handleCallback(req) {
    const parsed = parseCallbackQuery(req.query);
    const stateRow = parsed.state ? await one('SELECT * FROM meta_oauth_states WHERE state_hash = ?', [sha256(parsed.state)]) : null;
    const consume = stateRow
      ? await query('UPDATE meta_oauth_states SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL AND expires_at > NOW(3)', [stateRow.id])
      : { affectedRows: 0 };
    if (!stateRow || !consume.affectedRows) {
      await integrationLog(PROVIDER, 'warn', 'OAUTH_FAILED', 'OAuth callback rejected: invalid or expired state');
      return { ok: false, reason: 'INVALID_STATE' };
    }
    if (parsed.error) {
      await integrationLog(PROVIDER, 'warn', 'OAUTH_FAILED', `OAuth not completed: ${parsed.error}`, { userId: stateRow.user_id });
      return { ok: false, reason: parsed.error };
    }

    // The callback must come from the same signed-in CRM session that started the flow (stops login-CSRF / code injection).
    const sid = req.cookies?.[env.SESSION_COOKIE_NAME];
    const session = sid ? await sessionRepo.findActiveByToken(sha256(sid)) : null;
    if (!session || session.id !== stateRow.session_id || session.user_id !== stateRow.user_id) {
      await integrationLog(PROVIDER, 'warn', 'OAUTH_FAILED', 'OAuth callback rejected: session mismatch', { userId: stateRow.user_id });
      return { ok: false, reason: 'SESSION_MISMATCH' };
    }

    let step = 'code exchange';
    try {
      const { token, expiresAt } = await exchangeCodeForToken(parsed.code);
      step = 'token check';
      const info = await inspectToken(token).catch(async (e) => {
        // debug_token unavailable: fall back to the user's own permission list.
        await integrationLog(PROVIDER, 'warn', 'TOKEN_CHECK_SKIPPED', `debug_token failed (${e.metaMessage || e.message}); using /me/permissions`);
        const perms = await graph('me/permissions', { token });
        return { valid: true, expiresAt: null, scopes: (perms?.data || []).filter((p) => p.status === 'granted').map((p) => p.permission) };
      });
      if (!info.valid) return { ok: false, reason: 'TOKEN_INVALID' };
      step = 'profile';
      const me = await graph('me', { token, params: { fields: 'id,name' } });
      const connId = await repo.saveAuthorization({
        metaUserId: String(me.id), metaUserName: me.name || null, token, expiresAt: info.expiresAt || expiresAt, scopes: info.scopes, userId: stateRow.user_id,
      });
      const missing = REQUIRED_SCOPES.filter((s) => !info.scopes.includes(s));

      // Reconnect: keep the existing selection and refresh its Page tokens from the new user token.
      const { metaAssets } = await import('./metaAsset.service.js');
      const refreshed = await metaAssets.refreshPageTokens(connId, token).catch(() => false);
      await repo.setStatus(connId, refreshed && !missing.length ? 'ACTIVE' : 'PENDING_SETUP');
      await audit('INTEGRATION_CHANGED', { actorId: stateRow.user_id, entityType: 'meta_connection', entityId: connId, req, meta: { action: 'meta_connect', missingScopes: missing } });
      await integrationLog(PROVIDER, 'info', 'OAUTH_CONNECTED', `Connected as ${me.name || me.id}`, { connectionId: connId, missingScopes: missing, reconnect: refreshed });
      if (missing.length) return { ok: false, reason: 'MISSING_PERMISSIONS' };
      return { ok: true, reason: refreshed ? 'RECONNECTED' : 'CONNECTED' };
    } catch (err) {
      await integrationLog(PROVIDER, 'error', 'OAUTH_FAILED', `OAuth failed at ${step}: ${err.metaMessage || err.message}${err.metaCode != null ? ` (Meta code ${err.metaCode})` : ''}`,
        { step, errorCode: err.errorCode, metaCode: err.metaCode, metaSubcode: err.metaSubcode, fbtraceId: err.fbtraceId });
      return { ok: false, reason: err.errorCode || 'OAUTH_ERROR' };
    }
  },

  /** Re-checks the user token at most every 10 minutes (or on demand). Marks the connection on failure. */
  async checkToken(conn, { force = false } = {}) {
    if (!conn || conn.status === 'DISCONNECTED') return null;
    const fresh = conn.token_checked_at && Date.now() - new Date(conn.token_checked_at).getTime() < TOKEN_CHECK_INTERVAL_MS;
    if (fresh && !force) return { valid: Boolean(conn.token_valid), expiresAt: conn.token_expires_at, checked: false };
    const token = repo.userToken(conn);
    if (!token) {
      await repo.setTokenCheck(conn.id, { valid: false });
      return { valid: false, checked: true };
    }
    try {
      const info = await inspectToken(token);
      await repo.setTokenCheck(conn.id, { valid: info.valid, expiresAt: info.expiresAt, scopes: info.scopes });
      if (!info.valid) {
        await repo.setError(conn.id, 'META_TOKEN_INVALID', 'The Meta access token is no longer valid. Reconnect Meta.');
        await integrationLog(PROVIDER, 'warn', 'TOKEN_INVALID', 'Access token is no longer valid', { connectionId: conn.id });
      }
      return { valid: info.valid, expiresAt: info.expiresAt, scopes: info.scopes, checked: true };
    } catch (err) {
      // Meta unreachable is not proof the token is bad: keep the last known state.
      if (err.isTokenError) {
        await repo.setTokenCheck(conn.id, { valid: false });
        await repo.setError(conn.id, err.errorCode, err.message);
      }
      return { valid: err.isTokenError ? false : Boolean(conn.token_valid), apiError: err.message, checked: true };
    }
  },

  /** Record a Meta API failure on the connection (token problems flip it to ERROR so the UI offers Reconnect). */
  async recordApiError(conn, err, context) {
    if (!conn) return;
    if (err?.isTokenError || err?.isPermissionError) await repo.setError(conn.id, err.errorCode, err.message);
    await integrationLog(PROVIDER, err?.isTransient ? 'warn' : 'error', 'API_ERROR', `${context}: ${err?.message || 'unknown error'}`,
      { connectionId: conn.id, errorCode: err?.errorCode, metaCode: err?.metaCode, fbtraceId: err?.fbtraceId });
  },

  /**
   * Disconnect: unsubscribe Pages from the webhook, revoke the app's permissions, wipe every stored token.
   * Revocation failures are logged but never block the local disconnect.
   */
  async disconnect(req) {
    const conn = await repo.current();
    if (!conn || conn.status === 'DISCONNECTED') return { alreadyDisconnected: true };
    const warnings = [];
    const pages = await query("SELECT external_id, access_token_enc FROM meta_assets WHERE connection_id = ? AND asset_type = 'PAGE' AND access_token_enc IS NOT NULL", [conn.id]);
    const { decrypt } = await import('../../utils/crypto.js');
    for (const p of pages) {
      try {
        await graph(`${p.external_id}/subscribed_apps`, { token: decrypt(p.access_token_enc), method: 'DELETE' });
      } catch (err) { warnings.push(`Page ${p.external_id}: ${err.message}`); }
    }
    const userToken = repo.userToken(conn);
    if (userToken) {
      try { await graph('me/permissions', { token: userToken, method: 'DELETE' }); } catch (err) { warnings.push(`Revoke: ${err.message}`); }
    }
    await repo.wipe(conn.id);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', entityId: conn.id, req, meta: { action: 'meta_disconnect', warnings: warnings.length } });
    await integrationLog(PROVIDER, warnings.length ? 'warn' : 'info', 'DISCONNECTED', 'Connection disconnected and tokens removed', { connectionId: conn.id, warnings });
    return { disconnected: true, warnings };
  },
};
