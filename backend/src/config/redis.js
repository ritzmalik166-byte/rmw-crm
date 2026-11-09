import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let connection = null;
let available = false;

/** Shared ioredis connection for BullMQ. Returns null when REDIS_URL is not configured. */
export function getRedis() {
  if (!env.REDIS_URL) return null;
  if (connection) return connection;
  connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
  connection.on('ready', () => { available = true; logger.info('Redis connected'); });
  connection.on('error', (err) => { available = false; logger.error({ err: err.message }, 'Redis error'); });
  connection.on('end', () => { available = false; });
  return connection;
}

export const redisAvailable = () => available;
