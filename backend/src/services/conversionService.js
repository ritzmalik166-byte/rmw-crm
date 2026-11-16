/**
 * Records when a lead first reaches a conversion stage (Qualified, Site visit, Converted) in lead_conversions.
 * Provider-agnostic; leads from an ad platform are queued for that platform's conversion service.
 * Never throws: conversion tracking must not block a status change.
 */
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { enqueue } from '../workers/queues.js';
import { CONVERSION_TYPE_BY_STATUS, CONVERSION_TYPES, LEAD_SOURCE_TYPES } from '../config/leadSources.js';

/** Which conversion a status change represents, or null. Exported for tests. */
export function conversionTypeFor(statusCode, isConversion) {
  return CONVERSION_TYPE_BY_STATUS[statusCode] || (isConversion ? CONVERSION_TYPES.CONVERTED : null);
}

/** Providers with a server-side conversion pipeline. */
const PROVIDER_QUEUES = { [LEAD_SOURCE_TYPES.META]: 'meta-conversion' };

export async function recordStatusConversion({ lead, statusCode, isConversion, userId = null, value = null, currency = null }) {
  try {
    const type = conversionTypeFor(statusCode, isConversion);
    if (!type) return null;
    const job = PROVIDER_QUEUES[lead.source_type];
    const ins = await query(
      `INSERT IGNORE INTO lead_conversions (lead_id, conversion_type, conversion_value, currency, conversion_date, recorded_by, provider, provider_sync_status)
       VALUES (?, ?, ?, ?, NOW(3), ?, ?, ?)`,
      [lead.id, type, value, currency, userId, job ? lead.source_type : null, job ? 'PENDING' : 'NOT_APPLICABLE'],
    );
    if (!ins.affectedRows) return null; // this stage was already recorded for the lead
    if (job) await enqueue('lead-sync', job, { conversionId: ins.insertId });
    return { id: ins.insertId, type };
  } catch (err) {
    logger.error({ err: err.message, leadId: lead?.id }, 'Failed to record conversion');
    return null;
  }
}
