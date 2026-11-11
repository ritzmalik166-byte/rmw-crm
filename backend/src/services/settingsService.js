import { query } from '../config/db.js';
import { DEFAULT_SETTINGS } from '../config/rbac.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30_000;

function parseValue(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

async function load() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await query('SELECT setting_key, setting_value FROM system_settings');
  const map = { ...DEFAULT_SETTINGS };
  for (const r of rows) map[r.setting_key] = parseValue(r.setting_value);
  cache = map; cachedAt = Date.now();
  return map;
}

export const settingsService = {
  async get(key) { return (await load())[key]; },
  async all() { return { ...(await load()) }; },
  async set(key, value, userId) {
    if (!(key in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${key}`);
    await query(
      'INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
      [key, JSON.stringify(value), userId],
    );
    cache = null;
  },
};
