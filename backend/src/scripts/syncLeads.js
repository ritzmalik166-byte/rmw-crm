import { pool } from '../config/db.js';
import { syncWebsite, syncAll } from '../integrations/pull/syncService.js';

// Usage: npm run sync            (all websites)
//        npm run sync -- RMW     (one website)
const code = (process.argv[2] || '').toUpperCase();
(code ? syncWebsite(code).then((r) => [r]) : syncAll())
  .then((results) => { for (const r of results) console.log(JSON.stringify(r)); })
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
