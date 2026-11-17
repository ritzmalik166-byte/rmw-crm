import express, { Router } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { requirePermission as can } from '../middleware/auth.js';
import { limiters } from '../middleware/security.js';
import { validate } from '../validators/common.js';
import { asyncHandler as h, ok } from '../utils/http.js';
import { leadCaptureService as svc } from '../services/leadCaptureService.js';

/**
 * Public Lead Capture API, mounted at /api/public (before the CRM's CORS/origin checks: client landing pages call it).
 * GET  /api/public/leads?api_key=...&name=...   (Sell.do style)
 * POST /api/public/leads                        (JSON or HTML form; optional redirect=thank-you URL)
 */
export const leadCapturePublicRouter = Router();
leadCapturePublicRouter.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }));
leadCapturePublicRouter.use(limiters.publicLead);
const handle = h(async (req, res) => {
  const r = await svc.capture(req);
  const wantsHtml = req.method === 'POST' && req.is('application/x-www-form-urlencoded', 'multipart/form-data');
  if (r.redirect && wantsHtml) return res.redirect(303, r.redirect);
  res.status(201).json({ success: true, message: 'Lead received', data: { reference: r.reference } });
});
leadCapturePublicRouter.get('/leads', handle);
leadCapturePublicRouter.post('/leads', express.json({ limit: '50kb' }), express.urlencoded({ extended: true, limit: '50kb' }), handle);

const id = z.coerce.number().int().positive();
const optId = id.optional().nullable().or(z.literal('').transform(() => null));
const keyBody = z.object({
  name: z.string().trim().min(2).max(150),
  websiteId: id,
  assignmentTeamId: optId,
  allowedDomains: z.string().trim().max(1000).optional().nullable(),
  defaultProject: z.string().trim().max(255).optional().nullable(),
});

/** Admin: view keys (integration.view). Mounted under /api/admin. */
export const leadCaptureAdminRouter = Router();
leadCaptureAdminRouter.get('/lead-capture-keys', can('integration.view'), h(async (_req, res) => ok(res, await svc.list())));

/** Super Admin: manage keys (integration.manage). Mounted under /api/super-admin. */
export const leadCaptureSuperAdminRouter = Router();
const m = can('integration.manage');
leadCaptureSuperAdminRouter.post('/lead-capture-keys', m, validate(keyBody), h(async (req, res) => ok(res, await svc.create(req, req.body), 'API key created', 201)));
leadCaptureSuperAdminRouter.patch('/lead-capture-keys/:id', m, validate(keyBody.partial().extend({ isActive: z.boolean().optional() })), h(async (req, res) => {
  await svc.update(req, Number(req.params.id), req.body); ok(res, null, 'Saved');
}));
leadCaptureSuperAdminRouter.post('/lead-capture-keys/:id/rotate', m, h(async (req, res) => ok(res, await svc.rotate(req, Number(req.params.id)), 'New key generated')));
leadCaptureSuperAdminRouter.delete('/lead-capture-keys/:id', m, h(async (req, res) => { await svc.remove(req, Number(req.params.id)); ok(res, null, 'Key deleted'); }));
