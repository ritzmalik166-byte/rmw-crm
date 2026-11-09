import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from './env.js';
import { logger } from './logger.js';


function loadCa(value) {
  const v = value.trim().replace(/^["']|["']$/g, '');
  if (v.includes('-----BEGIN CERTIFICATE-----')) return v.replace(/\\n/g, '\n');
  const file = path.resolve(process.cwd(), v);
  if (!fs.existsSync(file)) {
    throw new Error(`DB_SSL_CA file not found: ${file}`);
  }
  return fs.readFileSync(file, 'utf8');
}

export function sslOptions() {
  if (!env.DB_SSL) return undefined;

  if (env.DB_SSL_CA) {
    return {
      ca: loadCa(env.DB_SSL_CA),
      rejectUnauthorized: true,
    };
  }

  logger.warn(
    'DB_SSL is enabled but DB_SSL_CA is not set; TLS is used without certificate verification.'
  );

  return {
    rejectUnauthorized: false,
  };
}

console.log('DB CONFIG:', {
  host: JSON.stringify(env.DB_HOST),
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  ssl: env.DB_SSL,
});

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  ssl: sslOptions(),
  waitForConnections: true,
  connectionLimit: env.DB_POOL_SIZE,
  maxIdle: env.DB_POOL_SIZE,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
  timezone: 'Z',
  dateStrings: false,
  supportBigNumbers: true,
  bigNumberStrings: false,
  namedPlaceholders: false,
  charset: 'utf8mb4',
});

pool.on('connection', (conn) =>
  conn.query("SET time_zone = '+00:00'")
);

/** Run a query on the pool (or on a transaction connection when provided). */
export async function query(sql, params = [], conn = null) {
  const [rows] = await (conn || pool).query(sql, params);
  return rows;
}

export async function one(sql, params = [], conn = null) {
  const rows = await query(sql, params, conn);
  return rows[0] || null;
}

/** Execute fn inside a transaction; commits on success, rolls back on error. */
export async function transaction(fn) {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const result = await fn(conn);

    await conn.commit();

    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback error
    }

    throw err;
  } finally {
    conn.release();
  }
}

export async function pingDb() {
  const started = Date.now();

  await pool.query('SELECT 1');

  return Date.now() - started;
}