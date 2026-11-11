import { pool, one } from '../config/db.js';
import { integrationService } from '../services/integrationService.js';

async function main() {
  const code = (process.argv[2] || '').toUpperCase();
  const w = await one('SELECT id FROM websites WHERE code = ?', [code]);
  if (!w) throw new Error('Usage: npm run integration:key -- <MPF|RMW|CT> [--signed]');
  const r = await integrationService.rotateKey(w.id, { requireSignature: process.argv.includes('--signed') });
  console.log(`\nWebsite:     ${r.website}\nAPI key:     ${r.apiKey}\nHMAC secret: ${r.hmacSecret}\nSigned:      ${r.requireSignature}\n\nStore these in the source website's environment now. They are not shown again.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
