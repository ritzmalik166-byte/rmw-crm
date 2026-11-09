import { integrationService } from '../services/integrationService.js';
import { badRequest } from '../utils/errors.js';

export const integrationController = {
  /** POST /api/integrations/:website/leads and POST /api/integrations/leads (website taken from the key). */
  async receive(req, res) {
    const website = await integrationService.authenticateSource(req, req.params.website);
    const r = await integrationService.receive(req, website, req.body);
    res.status(r.duplicate ? 200 : 202).json({ success: true, data: r });
  },

  /** POST /api/integrations/:website/leads/batch for backfills, up to 500 leads per call. */
  async receiveBatch(req, res) {
    const website = await integrationService.authenticateSource(req, req.params.website);
    const items = Array.isArray(req.body) ? req.body : req.body?.leads;
    if (!Array.isArray(items) || !items.length || items.length > 500) throw badRequest('Send 1 to 500 leads in "leads"', 'VALIDATION_ERROR');
    const results = [];
    for (const item of items) {
      try {
        results.push({ ok: true, ...(await integrationService.receive(req, website, item)) });
      } catch (err) {
        results.push({ ok: false, error: err.expose ? err.message : 'Failed' });
      }
    }
    res.status(207).json({ success: true, data: { accepted: results.filter((r) => r.ok).length, results } });
  },
};
