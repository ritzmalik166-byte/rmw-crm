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
import { integrationManageRouter } from './routes/integrationManageRoutes.js';
import integrationRoutes from './routes/integrationRoutes.js';
import { metaPublicRouter } from './integrations/meta/meta.routes.js';
import { leadCapturePublicRouter } from './routes/leadCaptureRoutes.js';
import { metaFormPublicRouter } from './routes/metaFormRoutes.js';
import { aiCallPublicRouter } from './integrations/aicall/aiCall.routes.js';

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

  // Meta webhook + OAuth callback: own body parser (raw bytes for signature checks). Must precede the generic mount.
  app.use('/api/integrations/meta', metaPublicRouter);
  // AI calling agent: provider posts call results here (shared-secret token). Own JSON parser, before the generic mount.
  app.use('/api/integrations/aicall', aiCallPublicRouter);
  // Public Lead Capture API for client landing pages (open CORS, key in the request).
  // Client Meta lead forms pushed by the client's middleware. Before the lead-capture router (it rate-limits all it sees).
  app.use('/api/public', metaFormPublicRouter);
  app.use('/api/public', leadCapturePublicRouter);
  app.use('/api/integrations', express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }), integrationRoutes);

  app.use('/api', cors({ origin: corsOrigins, credentials: true }), cookieParser(), express.json({ limit: '200kb' }), originCheck, limiters.api);
  app.use('/api/auth', authRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/admin', adminRouter);
  app.use('/api/super-admin', superAdminRouter);
  app.use('/api/manage', integrationManageRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
