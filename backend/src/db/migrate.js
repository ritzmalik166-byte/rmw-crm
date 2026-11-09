import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

function sslOptions() {
  if (!env.DB_SSL) return undefined;
  if (env.DB_SSL_CA) {
    const v = env.DB_SSL_CA.trim().replace(/^["']|["']$/g, '');
    const ca = v.includes('-----BEGIN CERTIFICATE-----')
      ? v.replace(/\\n/g, '\n')
      : fs.readFileSync(path.resolve(process.cwd(), v), 'utf8');
    return { ca, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: false };
}

/** Version-controlled SQL migrations. Each file in ./migrations runs once, in name order, inside a lock. */
async function run() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD,
    database: env.DB_NAME, ssl: sslOptions(), multipleStatements: true, timezone: 'Z',
  });
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
    const [[lock]] = await conn.query("SELECT GET_LOCK('rmw_crm_migrate', 30) AS got");
    if (!lock.got) throw new Error('Could not acquire migration lock');

    const [rows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      logger.info(`Applying migration ${file}`);
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      // MySQL DDL auto-commits, so each file should be written to be re-runnable (IF NOT EXISTS).
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      count += 1;
    }
    await conn.query("SELECT RELEASE_LOCK('rmw_crm_migrate')");
    logger.info(count ? `Applied ${count} migration(s)` : 'Database is up to date');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  logger.error({ err: err.message }, 'Migration failed');
  process.exit(1);
});
