/** Persistence for the Meta connection. Tokens are stored AES-256-GCM encrypted and only decrypted server-side. */
import { query, one } from '../../config/db.js';
import { encrypt, decrypt } from '../../utils/crypto.js';

/* Columns safe to return to the browser (no *_enc). */
const PUBLIC_COLS = `c.id, c.status, c.meta_user_id, c.meta_user_name, c.token_expires_at, c.token_checked_at, c.token_valid, c.granted_scopes,
  c.website_id, w.code AS website_code, w.name AS website_name, c.assignment_team_id, t.name AS assignment_team_name,
  c.connected_by, u.full_name AS connected_by_name, c.connected_at, c.last_webhook_at, c.last_lead_at, c.sync_started_at,
  c.last_sync_at, c.last_sync_status, c.last_sync_stats, c.last_error_code, c.last_error, c.last_error_at, c.disconnected_at`;
const FROM = `FROM meta_connections c LEFT JOIN websites w ON w.id = c.website_id LEFT JOIN teams t ON t.id = c.assignment_team_id
  LEFT JOIN users u ON u.id = c.connected_by`;

export const metaConnectionRepo = {
  /** The connection in use (single-connection model; the newest row). Includes encrypted columns for server use. */
  current: () => one('SELECT * FROM meta_connections ORDER BY id DESC LIMIT 1'),
  currentPublic: () => one(`SELECT ${PUBLIC_COLS} ${FROM} ORDER BY c.id DESC LIMIT 1`),
  byId: (id) => one('SELECT * FROM meta_connections WHERE id = ?', [id]),

  userToken(conn) {
    if (!conn?.user_token_enc) return null;
    try { return decrypt(conn.user_token_enc); } catch { return null; }
  },

  /** Insert or update the single connection after a successful OAuth exchange. */
  async saveAuthorization({ metaUserId, metaUserName, token, expiresAt, scopes, userId }) {
    const existing = await one('SELECT id FROM meta_connections ORDER BY id DESC LIMIT 1');
    const params = [metaUserId, metaUserName, encrypt(token), expiresAt, JSON.stringify(scopes || []), userId];
    if (existing) {
      await query(
        `UPDATE meta_connections SET meta_user_id = ?, meta_user_name = ?, user_token_enc = ?, token_expires_at = ?, granted_scopes = ?,
           connected_by = ?, connected_at = NOW(3), token_valid = 1, token_checked_at = NOW(3), disconnected_at = NULL,
           last_error_code = NULL, last_error = NULL, last_error_at = NULL WHERE id = ?`, [...params, existing.id],
      );
      return existing.id;
    }
    const r = await query(
      `INSERT INTO meta_connections (meta_user_id, meta_user_name, user_token_enc, token_expires_at, granted_scopes, connected_by, connected_at, token_valid, token_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), 1, NOW(3))`, params,
    );
    return r.insertId;
  },

  setStatus: (id, status) => query('UPDATE meta_connections SET status = ? WHERE id = ?', [status, id]),

  setError: (id, code, message) => query(
    "UPDATE meta_connections SET status = IF(status = 'DISCONNECTED', status, 'ERROR'), last_error_code = ?, last_error = ?, last_error_at = NOW(3) WHERE id = ?",
    [String(code || 'META_API_ERROR').slice(0, 60), String(message || '').slice(0, 1000), id],
  ),

  clearError: (id) => query('UPDATE meta_connections SET last_error_code = NULL, last_error = NULL, last_error_at = NULL WHERE id = ?', [id]),

  setTokenCheck: (id, { valid, expiresAt, scopes }) => query(
    'UPDATE meta_connections SET token_valid = ?, token_checked_at = NOW(3), token_expires_at = COALESCE(?, token_expires_at), granted_scopes = COALESCE(?, granted_scopes) WHERE id = ?',
    [valid ? 1 : 0, expiresAt || null, scopes ? JSON.stringify(scopes) : null, id],
  ),

  touchWebhook: () => query("UPDATE meta_connections SET last_webhook_at = NOW(3) WHERE status <> 'DISCONNECTED' ORDER BY id DESC LIMIT 1"),
  touchLead: (id) => query('UPDATE meta_connections SET last_lead_at = NOW(3) WHERE id = ?', [id]),

  /** Remove every credential and mark disconnected. Leads, forms and history stay. */
  async wipe(id) {
    await query(
      `UPDATE meta_connections SET status = 'DISCONNECTED', user_token_enc = NULL, token_valid = NULL, token_expires_at = NULL,
         disconnected_at = NOW(3), sync_started_at = NULL WHERE id = ?`, [id],
    );
    await query('UPDATE meta_assets SET access_token_enc = NULL, webhook_subscribed_at = NULL WHERE connection_id = ?', [id]);
  },

  selectedAssets: (connectionId) => query(
    'SELECT id, asset_type, external_id, name, parent_external_id, webhook_subscribed_at, meta FROM meta_assets WHERE connection_id = ? AND is_selected = 1 ORDER BY asset_type',
    [connectionId],
  ),

  /** The selected Page for a page id, with its decrypted token (server use only). */
  async pageWithToken(pageId) {
    const row = await one(
      `SELECT a.*, c.id AS conn_id, c.status AS conn_status, c.website_id, c.assignment_team_id FROM meta_assets a
       JOIN meta_connections c ON c.id = a.connection_id
       WHERE a.asset_type = 'PAGE' AND a.external_id = ? AND a.is_selected = 1 ORDER BY c.id DESC LIMIT 1`, [String(pageId)],
    );
    if (!row) return null;
    let token = null;
    try { token = row.access_token_enc ? decrypt(row.access_token_enc) : null; } catch { token = null; }
    return { ...row, token };
  },

  encryptToken: (t) => encrypt(t),
};
