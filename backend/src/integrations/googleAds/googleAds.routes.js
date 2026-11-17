import express, { Router } from 'express';
import { z } from 'zod';
import { requirePermission as can } from '../../middleware/auth.js';
import { limiters } from '../../middleware/security.js';
import { validate } from '../../validators/common.js';
import { pagination } from '../../validators/schemas.js';
import { asyncHandler as h, ok, pageMeta } from '../../utils/http.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { listIntegrationLogs } from '../../services/integrationLogService.js';
import { googleAds, PROVIDER } from './googleAds.service.js';

const id = z.coerce.number().int().positive();
const schemas = {
  settings: z.object({ websiteId: id, assignmentTeamId: id.optional().nullable() }),
  eventsQuery: pagination.extend({ status: z.enum(['RECEIVED', 'PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED']).optional() }),
};

/** Google-facing, mounted at /api/integrations/google-ads (no auth/CSRF: Google calls it; the key authenticates). */
export const googleAdsPublicRouter = Router();
googleAdsPublicRouter.post('/webhook', limiters.metaWebhook, express.json({ limit: '1mb' }), h(async (req, res) => {
  res.status(200).json({ success: true, data: await googleAds.receive(req.body) });
}));

/** Read-only, under /api/admin. */
export const googleAdsAdminRouter = Router();
googleAdsAdminRouter.get('/integrations/google-ads/status', can('integration.view'), h(async (req, res) => {
  const canManage = req.auth?.ctx?.permissions?.has?.('integration.manage');
  ok(res, await googleAds.status({ includeKey: Boolean(canManage) }));
}));
googleAdsAdminRouter.get('/integrations/google-ads/logs', can('integration.view'), h(async (req, res) => {
  ok(res, await listIntegrationLogs(PROVIDER, { limit: Math.min(200, Number(req.query.limit) || 50) }));
}));
googleAdsAdminRouter.get('/integrations/google-ads/events', can('integration.view'), validate(schemas.eventsQuery, 'query'), h(async (req, res) => {
  const q = req.validQuery;
  const { total, rows } = await googleAds.listEvents({ status: q.status || null, limit: q.limit, offset: (q.page - 1) * q.limit });
  ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
}));

/** Management, under /api/super-admin. */
export const googleAdsSuperAdminRouter = Router();
const m = can('integration.manage');
googleAdsSuperAdminRouter.put('/integrations/google-ads/settings', m, validate(schemas.settings), h(async (req, res) => {
  ok(res, await googleAds.saveSettings(req, req.body), 'Google Ads connected');
}));
googleAdsSuperAdminRouter.post('/integrations/google-ads/rotate-key', m, h(async (req, res) => {
  ok(res, await googleAds.rotateKey(req), 'New key generated');
}));
googleAdsSuperAdminRouter.post('/integrations/google-ads/events/:id/retry', m, h(async (req, res) => {
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId) || eventId <= 0) throw badRequest('Invalid event id');
  if (!(await googleAds.retry(eventId))) throw notFound('No failed event with that id');
  ok(res, null, 'Lead imported');
}));
googleAdsSuperAdminRouter.delete('/integrations/google-ads', m, h(async (req, res) => {
  ok(res, await googleAds.disconnect(req), 'Google Ads disconnected');
}));
