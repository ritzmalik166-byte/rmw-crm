import { Queue } from 'bullmq';
import { getRedis, redisAvailable } from '../config/redis.js';
import { logger } from '../config/logger.js';

export const QUEUE_NAMES = ['lead-sync', 'notifications', 'email', 'push-notifications', 'analytics'];

const queues = new Map();
const DEFAULT_JOB_OPTS = { attempts: 5, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 };

function getQueue(name) {
  const connection = getRedis();
  if (!connection) return null;
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTS }));
  return queues.get(name);
}


export async function enqueue(queueName, jobName, data, opts = {}) {
  const q = getQueue(queueName);
  if (q && redisAvailable()) {
    try {
      await q.add(jobName, data, opts);
      return;
    } catch (err) {
      logger.error({ err: err.message, queueName }, 'Enqueue failed; processing inline');
    }
  }
  setImmediate(async () => {
    try {
      const { processJob } = await import('./handlers.js');
      await processJob(queueName, jobName, data);
    } catch (err) {
      logger.error({ err: err.message, queueName, jobName }, 'Inline job failed');
    }
  });
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()));
}
