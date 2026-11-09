import { Worker, Queue } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { pool } from '../config/db.js';
import { QUEUE_NAMES } from './queues.js';
import { processJob } from './handlers.js';


const connection = getRedis();
if (!connection) {
  logger.error('REDIS_URL is not set; the worker needs Redis. Without Redis, the API processes jobs in-process.');
  process.exit(1);
}

const concurrency = { 'lead-sync': 5, email: 3, 'push-notifications': 5, notifications: 1, analytics: 1 };
const workers = QUEUE_NAMES.map((name) => {
  const w = new Worker(name, (job) => processJob(name, job.name, job.data), { connection, concurrency: concurrency[name] || 1 });
  w.on('failed', (job, err) => logger.error({ queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job failed'));
  return w;
});

const sweepQueue = new Queue('notifications', { connection });
await sweepQueue.upsertJobScheduler('followup-sweep', { every: 60_000 }, { name: 'followup-sweep', data: {} });
logger.info('Workers started');

async function shutdown() {
  logger.info('Shutting down workers');
  await Promise.all(workers.map((w) => w.close()));
  await sweepQueue.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
