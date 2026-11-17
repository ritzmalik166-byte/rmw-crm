import express, { Router } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { requirePermission as can } from '../middleware/auth.js';
import { limiters } from '../middleware/security.js';
import { validate } from '../validators/common.js';
import { asyncHandler as h, ok } from '../utils/http.js';
import { metaFormService as svc, MAX_IMPORT_ROWS } from '../services/metaFormService.js';

/**
 * Client Meta lead forms (no Page access). Public push endpoint, mounted at /api/public BEFORE the lead-capture router
 * (that router rate-limits everything that enters it):
 *   POST /api/public/meta-form-leads/:key     one lead, an array, or { leads: [...] }
 *   GET  /api/public/meta-form-leads/:key     with lead fields in the query (simple middleware), or no fields to test the URL
 * The key may also come in an X-Api-Key header with POST /api/public/meta-form-leads.
 */
export const metaFormPublicRouter = Router();
const pub = Router();
pub.use(cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] }), limiters.metaFormPush);
const keyOf = (req) => req.params.key || req.get('x-api-key') || req.query.api_key || null;
const push = h(async (req, res) => {
  const { api_key: _k, ...q } = req.query;
  const body = req.method === 'GET' ? q : req.body;
  if (req.method === 'GET' && !Object.keys(q).length) {
    // URL check from the middleware setup screen: validate the key without creating anything.
    return res.json({ success: true, message: 'Form URL is valid', data: await svc.verify(keyOf(req)) });
  }
  const r = await svc.push(keyOf(req), body);
  res.status(r.accepted ? 201 : 200).json({ success: true, message: r.tests && !r.accepted ? 'Test lead received: fields recorded, no lead created' : 'Lead received', data: r });
});
const parsers = [express.json({ limit: '1mb' }), express.urlencoded({ extended: true, limit: '1mb' })];
pub.get('/:key', push);
pub.post('/:key', ...parsers, push);
pub.post('/', ...parsers, push);
metaFormPublicRouter.use('/meta-form-leads', pub);

const id = z.coerce.number().int().positive();
const optId = id.optional().nullable().or(z.literal('').transform(() => null));
const mapSchema = z.record(z.string().max(40), z.string().max(270)).refine((m) => Object.keys(m).length <= 40, 'Too many mapped fields');
const formBody = z.object({
  clientName: z.string().trim().min(2).max(150),
  formId: z.string().trim().regex(/^\d{5,32}$/, 'Meta form id is the number from Ads Manager / Leads Center'),
  formName: z.string().trim().min(1).max(255),
  projectName: z.string().trim().max(255).optional().nullable(),
  campaignType: z.string().trim().max(60).optional().nullable(),
  integrationType: z.enum(['MIDDLEWARE', 'DIRECT']).optional(),
  websiteId: id,
  assignmentTeamId: optId,
  fieldMap: mapSchema.optional(),
});
const importBody = z.object({ rows: z.array(z.record(z.string().max(200), z.any())).min(1).max(MAX_IMPORT_ROWS) });

/** Admin: view registrations (integration.view). Mounted under /api/admin. */
export const metaFormAdminRouter = Router();
metaFormAdminRouter.get('/meta-forms', can('integration.view'), h(async (_req, res) => ok(res, await svc.list())));

/** Super Admin: manage (integration.manage). Mounted under /api/super-admin. */
export const metaFormSuperAdminRouter = Router();
const m = can('integration.manage');
metaFormSuperAdminRouter.post('/meta-forms', m, validate(formBody), h(async (req, res) => ok(res, await svc.create(req, req.body), 'Form registered', 201)));
metaFormSuperAdminRouter.patch('/meta-forms/:id', m, validate(formBody.partial().extend({ isActive: z.boolean().optional() })), h(async (req, res) => {
  await svc.update(req, Number(req.params.id), req.body); ok(res, null, 'Saved');
}));
metaFormSuperAdminRouter.get('/meta-forms/:id/suggest', m, h(async (req, res) => ok(res, await svc.suggest(Number(req.params.id)))));
metaFormSuperAdminRouter.post('/meta-forms/:id/import', m, validate(importBody), h(async (req, res) => ok(res, await svc.importRows(req, Number(req.params.id), req.body.rows), 'Import finished')));
metaFormSuperAdminRouter.post('/meta-forms/:id/rotate', m, h(async (req, res) => ok(res, await svc.rotate(req, Number(req.params.id)), 'New URL generated')));
metaFormSuperAdminRouter.delete('/meta-forms/:id', m, h(async (req, res) => { await svc.remove(req, Number(req.params.id)); ok(res, null, 'Form removed'); }));
