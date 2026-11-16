import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { requirePermission as can } from '../../middleware/auth.js';
import { limiters } from '../../middleware/security.js';
import { validate } from '../../validators/common.js';
import { pagination } from '../../validators/schemas.js';
import { asyncHandler as h } from '../../utils/http.js';
import { metaController as c } from './meta.controller.js';

const metaId = z.string().trim().regex(/^\d{1,32}$/);
const optMetaId = metaId.optional().nullable().or(z.literal('').transform(() => null));
const id = z.coerce.number().int().positive();

const schemas = {
  select: z.object({
    pageId: metaId,
    businessId: optMetaId,
    instagramId: optMetaId,
    adAccountId: z.string().trim().regex(/^act_\d{1,32}$/).optional().nullable().or(z.literal('').transform(() => null)),
    websiteId: id,
    assignmentTeamId: id.optional().nullable(),
  }),
  settings: z.object({ websiteId: id.optional(), assignmentTeamId: id.optional().nullable() }),
  analyticsQuery: z.object({
    from: z.string().max(40).optional(), to: z.string().max(40).optional(), websiteId: id.optional(),
    campaignId: metaId.optional(), adSetId: metaId.optional(), adId: metaId.optional(), formId: metaId.optional(),
    statusId: id.optional(), platform: z.enum(['facebook', 'instagram']).optional(),
    assignedUserId: z.union([z.literal('unassigned'), id]).optional(),
  }),
  eventsQuery: pagination.extend({ status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED']).optional() }),
};

/**
 * Meta-facing endpoints, mounted at /api/integrations/meta (no CORS, no CSRF origin check: Meta calls these).
 * The webhook keeps the raw body bytes for X-Hub-Signature-256 verification.
 */
export const metaPublicRouter = Router();
metaPublicRouter.get('/webhook', limiters.metaWebhook, h(c.verifyWebhook));
metaPublicRouter.post('/webhook', limiters.metaWebhook,
  express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBodyBuf = Buffer.from(buf); } }), h(c.receiveWebhook));
metaPublicRouter.get('/oauth/callback', limiters.metaOAuth, cookieParser(), h(c.oauthCallback));

/** Read-only, mounted under /api/admin (already authenticated + area.admin). */
export const metaAdminRouter = Router();
metaAdminRouter.get('/integrations/providers', can('integration.view'), h(c.providers));
metaAdminRouter.get('/integrations/meta/status', can('integration.view'), h(c.status));
metaAdminRouter.get('/integrations/meta/logs', can('integration.view'), h(c.logs));
metaAdminRouter.get('/integrations/meta/events', can('integration.view'), validate(schemas.eventsQuery, 'query'), h(c.events));
metaAdminRouter.get('/marketing/meta/analytics', can('analytics.view'), validate(schemas.analyticsQuery, 'query'), h(c.analytics));

/** Management, mounted under /api/super-admin (authenticated + area.super_admin + CSRF origin check). */
export const metaSuperAdminRouter = Router();
const m = can('integration.manage');
metaSuperAdminRouter.post('/integrations/meta/connect', m, h(c.connect));
metaSuperAdminRouter.get('/integrations/meta/assets', m, h(c.assets));
metaSuperAdminRouter.get('/integrations/meta/assets/forms', m, h(c.forms));
metaSuperAdminRouter.put('/integrations/meta/selection', m, validate(schemas.select), h(c.select));
metaSuperAdminRouter.patch('/integrations/meta/settings', m, validate(schemas.settings), h(c.settings));
metaSuperAdminRouter.post('/integrations/meta/sync', m, h(c.sync));
metaSuperAdminRouter.post('/integrations/meta/events/:id/retry', m, h(c.retryEvent));
metaSuperAdminRouter.delete('/integrations/meta', m, h(c.disconnect));
