import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { env, corsOrigins } from './config/env.js';
import { logger } from './config/logger.js';
import { pingDb } from './config/db.js';
import { originCheck, limiters } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import crmRoutes from './routes/crmRoutes.js';
import { adminRouter, superAdminRouter } from './routes/adminRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === '/health' },
    serializers: { req: () => undefined, res: () => undefined },
    customSuccessMessage: (req, res, ms) => `${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(ms)}ms`,
    customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
  }));
  app.use(compression());

  app.get('/health', async (_req, res) => {
    try { await pingDb(); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  // Machine-to-machine webhooks: no CORS, no cookies; raw body kept for HMAC verification.
  app.use('/api/integrations', express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }), integrationRoutes);

  // Browser API: credentialed CORS for allowed origins only, JSON bodies only, Origin check on writes.
  app.use('/api', cors({ origin: corsOrigins, credentials: true }), cookieParser(), express.json({ limit: '200kb' }), originCheck, limiters.api);
  app.use('/api/auth', authRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/admin', adminRouter);
  app.use('/api/super-admin', superAdminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
