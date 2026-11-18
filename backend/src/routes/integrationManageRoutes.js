import { Router } from 'express';
import { authenticate, requireAnyPermission } from '../middleware/auth.js';
import { asyncHandler as h } from '../utils/http.js';
import { metaSuperAdminRouter } from '../integrations/meta/meta.routes.js';
import { metaController as c } from '../integrations/meta/meta.controller.js';
import { adminController as admin } from '../controllers/adminController.js';
import { validate } from '../validators/common.js';
import { pagination } from '../validators/schemas.js';
import { z } from 'zod';

/**
 * /api/manage: integrations for anyone granted the permission, independent of area (Admin / Super Admin panel).
 * A CRM user given "integration.manage" connects Meta and switches Pages from the CRM home page.
 * Each management route still checks integration.manage itself (metaSuperAdminRouter).
 */
export const integrationManageRouter = Router();
const r = integrationManageRouter;
r.use(authenticate, requireAnyPermission('integration.view', 'integration.manage'));
r.get('/integrations/providers', h(c.providers));
r.get('/integrations/meta/status', h(c.status));
r.get('/integrations/meta/logs', h(c.logs));
r.get('/integrations/meta/events', validate(pagination.extend({ status: z.enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED']).optional() }), 'query'), h(c.events));
// Pipeline / team pickers in the Meta dialogs.
r.get('/websites', h(admin.websites));
r.get('/teams', h(admin.teams));
r.use(metaSuperAdminRouter);
