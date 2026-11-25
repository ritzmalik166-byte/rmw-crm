import crypto from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { requirePermission as can, requireAnyPermission } from '../../middleware/auth.js';
import { validate } from '../../validators/common.js';
import { asyncHandler as h, ok } from '../../utils/http.js';
import { badRequest } from '../../utils/errors.js';
import { PROVIDERS } from './providers.js';
import * as svc from './aiCall.service.js';

const id = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id'); return n; };

/* ---------- Public: provider result webhook (/api/integrations/aicall/:provider/webhook) ---------- */
function secretMatches(given) {
  const want = env.AI_CALL_WEBHOOK_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const aiCallPublicRouter = Router();
aiCallPublicRouter.post('/:provider/webhook', express.json({ limit: '5mb' }), h(async (req, res) => {
  const provider = req.params.provider;
  if (!PROVIDERS[provider] || provider === 'simulator') return res.status(404).json({ success: false, message: 'Unknown provider' });
  if (!env.AI_CALL_WEBHOOK_SECRET) return res.status(503).json({ success: false, message: 'AI_CALL_WEBHOOK_SECRET is not configured' });
  const token = req.query.token || req.get('x-vapi-secret') || req.get('x-webhook-secret');
  if (!secretMatches(token)) return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  try {
    const matched = await svc.handleWebhook(provider, req.body);
    return res.json({ success: true, matched });
  } catch (err) {
    logger.error({ provider, err: err.message }, 'AI call webhook failed');
    return res.status(500).json({ success: false, message: 'Could not process the result' });
  }
}));

/* ---------- CRM (mounted inside /api/crm, already authenticated) ---------- */
export const aiCallCrmRouter = Router();
aiCallCrmRouter.get('/leads/:id/ai-calls', can('aicall.view'), h(async (req, res) => ok(res, await svc.listForLead(req, id(req.params.id)))));
aiCallCrmRouter.post('/leads/:id/ai-calls', can('aicall.view'), can('lead.edit'), h(async (req, res) => ok(res, await svc.scheduleManual(req, id(req.params.id)), 'AI call requested', 201)));
aiCallCrmRouter.post('/ai-calls/:id/cancel', can('aicall.view'), can('lead.edit'), h(async (req, res) => { await svc.cancelCall(req, id(req.params.id)); ok(res, null, 'Call cancelled'); }));
aiCallCrmRouter.get('/ai-calls/:id/recording', can('aicall.view'), h(async (req, res) => svc.streamRecording(req, res, id(req.params.id))));

/* ---------- Super Admin (mounted inside /api/super-admin) ---------- */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
const configSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['simulator', 'vapi', 'bolna']),
  websites: z.array(z.string().max(20)).max(20),
  delayMinutes: z.number().int().min(1).max(1440),
  windowStart: hhmm,
  windowEnd: hhmm,
  maxAttempts: z.number().int().min(1).max(5),
  retryMinutes: z.array(z.number().int().min(5).max(1440)).max(5),
  skipIfWorked: z.boolean(),
  recentCallDays: z.number().int().min(0).max(90),
  openingLine: z.string().trim().min(10).max(600),
  questions: z.array(z.string().trim().min(3).max(300)).min(1).max(20),
  language: z.enum(['hinglish', 'hindi', 'english']),
  profiles: z.record(z.string().regex(/^[A-Z0-9_]{1,20}$/), z.object({
    agentId: z.string().trim().max(100).regex(/^[\w-]*$/, 'Agent ID: letters, numbers and dashes only').optional(),
    openingLine: z.string().trim().max(600).optional(),
    questions: z.array(z.string().trim().min(3).max(300)).max(20).optional(),
  })),
}).partial();

export const aiCallSuperAdminRouter = Router();
aiCallSuperAdminRouter.get('/ai-calling', requireAnyPermission('aicall.manage', 'settings.view'), h(async (_req, res) => ok(res, await svc.overview())));
aiCallSuperAdminRouter.put('/ai-calling', can('aicall.manage'), validate(configSchema), h(async (req, res) => ok(res, await svc.saveConfig(req.body, req.auth.user.id), 'AI calling settings saved')));
