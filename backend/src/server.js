import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { pool, pingDb } from './config/db.js';
import { getRedis } from './config/redis.js';
import { createApp } from './app.js';
import { initSocket } from './realtime/socket.js';
import { closeQueues } from './workers/queues.js';
import { runFollowupSweep } from './services/followupScheduler.js';
import { runAiCallSweep } from './integrations/aicall/aiCall.service.js';

const app = createApp();
const server = http.createServer(app);
initSocket(server);

let sweepTimer = null;
let metaPollTimer = null;

async function start() {
  try {
    const ms = await pingDb();
    logger.info(`MySQL connected (${ms} ms)`);
  } catch (err) {
    logger.error({ err: err.message, host: env.DB_HOST, port: env.DB_PORT, database: env.DB_NAME }, 'MySQL connection failed; check the DB_* settings in .env (for the server DB from localhost, run npm run db:tunnel first)');
    process.exit(1);
  }
  if (!getRedis()) {
    
    logger.warn('REDIS_URL not set: background jobs run in-process (fine for development, not for production).');
    sweepTimer = setInterval(() => {
      runAiCallSweep().catch((e) => logger.error({ err: e.message }, 'AI call sweep failed'));
      runFollowupSweep().catch((e) => logger.error({ err: e.message }, 'Follow-up sweep failed'));
    }, 60_000);
  }
  if (env.SYNC_INTERVAL_MINUTES > 0) {
    const { syncAll } = await import('./integrations/pull/syncService.js');
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      // Meta is not synced on a schedule: webhooks deliver new leads, and a full sync runs only when started from Integrations.
      try { await syncAll(); } catch (e) { logger.error({ err: e.message }, 'Scheduled pull sync failed'); } finally { running = false; }
    };
    setTimeout(tick, 15_000);
    setInterval(tick, env.SYNC_INTERVAL_MINUTES * 60_000);
  }
  // Live Meta leads: webhook is instant; this poll catches anything it misses within ~1 minute.
  const { startMetaLivePoll } = await import('./integrations/meta/metaLivePoll.service.js');
  metaPollTimer = startMetaLivePoll(env.META_LIVE_POLL_SECONDS);
  server.listen(env.PORT, () => logger.info(`RMW CRM API listening on :${env.PORT}`));
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down`);
  clearInterval(sweepTimer);
  clearInterval(metaPollTimer);
  server.close();
  await closeQueues().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err: err?.message }, 'Unhandled rejection'));

start();
