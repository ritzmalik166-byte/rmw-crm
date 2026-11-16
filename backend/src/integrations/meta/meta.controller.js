import { env } from '../../config/env.js';
import { ok, pageMeta } from '../../utils/http.js';
import { badRequest, notFound } from '../../utils/errors.js';
import { audit } from '../../services/auditService.js';
import { listIntegrationLogs } from '../../services/integrationLogService.js';
import { listProviders } from '../providers.js';
import { metaAuth } from './metaAuth.service.js';
import { metaAssets } from './metaAsset.service.js';
import { metaWebhook, verifySubscription } from './metaWebhook.service.js';
import { metaSync } from './metaSync.service.js';
import { metaStatus } from './metaStatus.service.js';
import { metaAnalytics } from './metaAnalytics.service.js';
import { PROVIDER } from './meta.config.js';

const appUrl = () => env.APP_URL.replace(/\/$/, '');

export const metaController = {
  /* ── Public (Meta-facing) ─────────────────────────────── */

  /** GET /api/integrations/meta/webhook: subscription handshake. Plain-text challenge on success. */
  verifyWebhook(req, res) {
    const challenge = verifySubscription(req.query);
    res.type('text/plain').send(challenge);
  },

  /** POST /api/integrations/meta/webhook: acknowledge fast; leads are processed by the queue. */
  async receiveWebhook(req, res) {
    const r = await metaWebhook.receive(req);
    res.status(200).json({ success: true, data: r });
  },

  /** GET /api/integrations/meta/oauth/callback: Facebook redirects the browser here. Always redirects back to the CRM. */
  async oauthCallback(req, res) {
    const r = await metaAuth.handleCallback(req);
    const qs = new URLSearchParams({ meta: r.ok ? 'connected' : 'error', reason: r.reason });
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, `${appUrl()}/super-admin/integrations?${qs}`);
  },

  /* ── Admin (integration.view / analytics.view) ───────── */

  async providers(_req, res) { ok(res, listProviders()); },
  async status(_req, res) { ok(res, await metaStatus()); },
  async logs(req, res) { ok(res, await listIntegrationLogs(PROVIDER, { limit: Math.min(200, Number(req.query.limit) || 50) })); },
  async events(req, res) {
    const q = req.validQuery;
    const { total, rows } = await metaWebhook.listEvents({ status: q.status || null, limit: q.limit, offset: (q.page - 1) * q.limit });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async analytics(req, res) { ok(res, await metaAnalytics.overview(req, req.validQuery)); },

  /* ── Super Admin (integration.manage) ─────────────────── */

  async connect(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    ok(res, await metaAuth.createAuthorization(req));
  },
  async assets(_req, res) { ok(res, await metaAssets.listAvailable()); },
  async forms(req, res) { ok(res, await metaAssets.listForms(String(req.query.pageId || ''))); },
  async select(req, res) { ok(res, await metaAssets.select(req, req.body), 'Meta connection saved'); },
  async settings(req, res) { await metaAssets.updateSettings(req, req.body); ok(res, null, 'Settings saved'); },
  async sync(req, res) {
    const r = await metaSync.requestSync(req.auth.user.id);
    await audit('INTEGRATION_CHANGED', { actorId: req.auth.user.id, entityType: 'meta_connection', req, meta: { action: 'meta_sync' } });
    ok(res, r, 'Sync started', 202);
  },
  async retryEvent(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid event id');
    if (!(await metaWebhook.retry(id))) throw notFound('No failed event with that id');
    ok(res, null, 'Retry queued');
  },
  async disconnect(req, res) { ok(res, await metaAuth.disconnect(req), 'Meta disconnected'); },
};
