import { query } from '../config/db.js';
import { logger } from '../config/logger.js';

const SENSITIVE = /token|secret|proof|password|authorization|cookie/i;
const LABELS = { META: 'Meta', GOOGLE_ADS: 'Google Ads', WHATSAPP: 'WhatsApp', WEBSITE: 'Website' };

/** Drop any key that could hold a credential, at any depth. */
export function scrubMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta ?? null;
  const out = Array.isArray(meta) ? [] : {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE.test(k)) continue;
    out[k] = v && typeof v === 'object' ? scrubMeta(v) : v;
  }
  return out;
}

/**
 * Structured integration log: written to the app log ("[Meta] Lead imported") and to integration_logs for the
 * Integrations page. Never throws, so logging can't break lead processing.
 */
export async function integrationLog(provider, level, event, message, meta = null) {
  const safe = scrubMeta(meta);
  const lvl = ['info', 'warn', 'error'].includes(level) ? level : 'info';
  logger[lvl]({ provider, event, ...(safe || {}) }, `[${LABELS[provider] || provider}] ${message}`);
  try {
    await query('INSERT INTO integration_logs (provider, level, event, message, meta) VALUES (?, ?, ?, ?, ?)',
      [provider, lvl, String(event).slice(0, 60), String(message).slice(0, 500), safe ? JSON.stringify(safe) : null]);
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to write integration log');
  }
}

export async function listIntegrationLogs(provider, { limit = 50 } = {}) {
  return query('SELECT id, level, event, message, meta, created_at FROM integration_logs WHERE provider = ? ORDER BY id DESC LIMIT ?', [provider, limit]);
}
