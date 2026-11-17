/**
 * IntegrationProvider registry for marketing / messaging lead sources.
 *
 * Contract for an implemented provider (see integrations/meta for the reference implementation):
 *   - OAuth or credential connect flow, with tokens encrypted at rest and never sent to the browser
 *   - webhook and/or pull sync that normalises each lead to the canonical shape (integrations/canonical.js)
 *   - hands every lead to the shared Lead Processor: services/leadIngestService.upsertCanonicalLead
 *     (one pipeline for Website, Meta, Google Ads and WhatsApp; no per-source lead tables)
 *   - sets canonical.sourceType (config/leadSources.js) and sourceLeadId for duplicate detection
 *   - status() for the Integrations page; logs via services/integrationLogService
 */
import { LEAD_SOURCE_TYPES } from '../config/leadSources.js';
import { isMetaConfigured, isWebhookConfigured, missingConfig } from './meta/meta.config.js';

export const INTEGRATION_PROVIDERS = [
  {
    key: LEAD_SOURCE_TYPES.META,
    name: 'Meta',
    description: 'Facebook + Instagram Lead Ads',
    category: 'ADS',
    implemented: true,
    serverConfig: () => ({ configured: isMetaConfigured(), webhookConfigured: isWebhookConfigured(), missing: missingConfig() }),
  },
  {
    key: LEAD_SOURCE_TYPES.GOOGLE_ADS,
    name: 'Google Ads',
    description: 'Google Ads lead form webhook',
    category: 'ADS',
    implemented: true,
    serverConfig: () => ({ configured: true, missing: [] }),
  },
  {
    key: LEAD_SOURCE_TYPES.WHATSAPP,
    name: 'WhatsApp',
    description: 'WhatsApp Business conversations',
    category: 'MESSAGING',
    implemented: false,
    serverConfig: () => ({ configured: false, missing: [] }),
  },
];

export function listProviders() {
  return INTEGRATION_PROVIDERS.map(({ serverConfig, ...p }) => ({ ...p, ...serverConfig() }));
}
