/**
 * AI calling agent: calls each new lead a few minutes after it arrives, asks the project questions, and stores the
 * recording, transcript, summary and answers on the lead.
 *
 * Flow: new lead → scheduleForNewLead() writes a SCHEDULED row → runAiCallSweep() (every minute, with the follow-up
 * sweep) places due calls through the configured provider → the provider posts the result to the webhook →
 * handleResult() saves it, schedules a retry for no-answer / busy, creates a callback follow-up, notifies the owner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { query, one } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { badRequest, conflict, notFound } from '../../utils/errors.js';
import { audit } from '../../services/auditService.js';
import { loadVisibleLead } from '../../services/leadService.js';
import { notificationService } from '../../notifications/notificationService.js';
import { userRepo } from '../../repositories/userRepo.js';
import { getProvider, providerList } from './providers.js';
import {
  resolveConfig, plannedCallTime, inCallingWindow, nextWindowStart, toIndianMobileE164, fillTemplate, retryDelay,
  normalizeAnswers, deriveOutcome, statusFromEnd, profileFor,
} from './aiCall.logic.js';

const ACTIVE = ['SCHEDULED', 'DIALING', 'IN_PROGRESS'];
const OUTCOME_LABEL = {
  INTERESTED: 'Interested', NOT_INTERESTED: 'Not interested', CALLBACK: 'Wants a call back', WRONG_NUMBER: 'Wrong number',
  DO_NOT_CALL: 'Asked not to be called', UNCLEAR: 'Outcome unclear',
};
const SKIP_LABEL = {
  disabled: 'AI calling is switched off', website_off: 'AI calling is off for this website', lead_missing: 'Lead no longer exists',
  merged: 'Lead was merged into another', junk: 'Lead is marked junk / test', do_not_call: 'Customer asked not to be called',
  invalid_phone: 'No valid Indian mobile number', already_worked: 'The team already started working this lead',
  called_recently: 'This number was called recently from another lead',
};

/* ---------------- Config ---------------- */
let cfgCache = null;
let cfgAt = 0;
export async function getConfig() {
  if (cfgCache && Date.now() - cfgAt < 30_000) return cfgCache;
  const row = await one('SELECT config FROM ai_call_config WHERE id = 1');
  const stored = row ? (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) : null;
  cfgCache = resolveConfig(stored); cfgAt = Date.now();
  return cfgCache;
}

export async function saveConfig(input, userId) {
  const cfg = resolveConfig({ ...(await getConfig()), ...input });
  if (cfg.enabled) {
    const p = getProvider(cfg.provider);
    if (!p.configured()) throw badRequest(`${p.label} isn't set up on the server yet (missing ${p.missing().join(', ')}). Add the keys to the backend .env first.`);
  }
  await query(
    'INSERT INTO ai_call_config (id, config, updated_by) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config), updated_by = VALUES(updated_by)',
    [JSON.stringify(cfg), userId],
  );
  cfgCache = null;
  await audit('AI_CALL_CONFIG_UPDATED', { actorId: userId, entityType: 'ai_call_config', entityId: 1, meta: { enabled: cfg.enabled, provider: cfg.provider, websites: cfg.websites } });
  return cfg;
}

/* ---------------- Eligibility ---------------- */
async function loadLead(leadId) {
  return one(
    `SELECT l.*, w.code AS website_code, w.name AS website_name, s.code AS status_code
     FROM leads l JOIN websites w ON w.id = l.website_id JOIN lead_statuses s ON s.id = l.status_id WHERE l.id = ?`, [leadId],
  );
}

/** Why this lead must not be called right now (a SKIP_LABEL key), or null when it can be. */
async function ineligibility(lead, cfg, { manual = false } = {}) {
  if (!lead) return 'lead_missing';
  if (lead.merged_into_lead_id) return 'merged';
  if (lead.junk_reason) return 'junk';
  if (lead.do_not_call) return 'do_not_call';
  if (!toIndianMobileE164(lead.phone)) return 'invalid_phone';
  if (manual) return null;
  if (!cfg.enabled) return 'disabled';
  if (!cfg.websites.includes(lead.website_code)) return 'website_off';
  if (cfg.skipIfWorked) {
    const worked = await one(
      `SELECT (? <> 'NEW')
         OR EXISTS (SELECT 1 FROM lead_notes WHERE lead_id = ? AND user_id IS NOT NULL)
         OR EXISTS (SELECT 1 FROM lead_followups WHERE lead_id = ? AND created_by IS NOT NULL)
         OR EXISTS (SELECT 1 FROM lead_activities WHERE lead_id = ? AND type = 'STATUS_CHANGED') AS worked`,
      [lead.status_code, lead.id, lead.id, lead.id],
    );
    if (Number(worked?.worked)) return 'already_worked';
  }
  if (cfg.recentCallDays > 0) {
    const recent = await one(
      `SELECT 1 AS hit FROM ai_calls WHERE to_phone = ? AND lead_id <> ? AND status IN ('COMPLETED','DIALING','IN_PROGRESS')
         AND created_at > NOW(3) - INTERVAL ? DAY LIMIT 1`,
      [toIndianMobileE164(lead.phone), lead.id, cfg.recentCallDays],
    );
    if (recent) return 'called_recently';
  }
  return null;
}

const activeCallFor = (leadId) => one(`SELECT id, status, scheduled_at FROM ai_calls WHERE lead_id = ? AND status IN (${ACTIVE.map(() => '?').join(',')}) LIMIT 1`, [leadId, ...ACTIVE]);

/* ---------------- Scheduling ---------------- */

/** Called right after a new lead is stored. Never throws: a calling problem must not break lead intake. */
export async function scheduleForNewLead(leadId) {
  try {
    const cfg = await getConfig();
    if (!cfg.enabled) return null;
    const lead = await loadLead(leadId);
    const reason = await ineligibility(lead, cfg);
    if (reason || (await activeCallFor(leadId))) return null;
    const at = plannedCallTime(new Date(), cfg);
    const r = await query(
      "INSERT INTO ai_calls (lead_id, attempt, status, trigger_type, scheduled_at, to_phone) VALUES (?, 1, 'SCHEDULED', 'AUTO', ?, ?)",
      [leadId, at, toIndianMobileE164(lead.phone)],
    );
    return r.insertId;
  } catch (err) {
    logger.error({ leadId, err: err.message }, 'AI call scheduling failed');
    return null;
  }
}

/** "Call with AI now" from the lead page. Respects calling hours (queues for the next window outside them). */
export async function scheduleManual(req, leadId) {
  await loadVisibleLead(req, leadId);
  const cfg = await getConfig();
  const provider = getProvider(cfg.provider);
  if (!provider.configured()) throw badRequest(`${provider.label} isn't set up on the server yet. A Super Admin must add its keys first.`);
  const lead = await loadLead(leadId);
  const reason = await ineligibility(lead, cfg, { manual: true });
  if (reason) throw badRequest(`Can't call this lead: ${SKIP_LABEL[reason].toLowerCase()}.`, 'AI_CALL_NOT_ALLOWED');
  if (await activeCallFor(leadId)) throw conflict('An AI call for this lead is already scheduled or in progress.', 'AI_CALL_ACTIVE');
  const now = new Date();
  const at = inCallingWindow(now, cfg.windowStart, cfg.windowEnd) ? now : nextWindowStart(now, cfg.windowStart);
  const r = await query(
    "INSERT INTO ai_calls (lead_id, attempt, status, trigger_type, scheduled_at, to_phone, created_by) VALUES (?, 1, 'SCHEDULED', 'MANUAL', ?, ?, ?)",
    [leadId, at, toIndianMobileE164(lead.phone), req.auth.user.id],
  );
  await query("INSERT INTO lead_activities (lead_id, user_id, type, meta) VALUES (?, ?, 'AI_CALL_REQUESTED', ?)", [leadId, req.auth.user.id, JSON.stringify({ callId: r.insertId, scheduledAt: at })]);
  if (at === now) setImmediate(() => claimAndPlace(r.insertId).catch((e) => logger.error({ err: e.message }, 'AI call start failed')));
  return { id: r.insertId, scheduledAt: at, queuedForWindow: at !== now };
}

export async function cancelCall(req, callId) {
  const call = await one('SELECT * FROM ai_calls WHERE id = ?', [callId]);
  if (!call) throw notFound('Call not found');
  await loadVisibleLead(req, call.lead_id);
  const r = await query("UPDATE ai_calls SET status = 'CANCELLED', skip_reason = 'cancelled_by_user' WHERE id = ? AND status = 'SCHEDULED'", [callId]);
  if (!r.affectedRows) throw conflict('Only a call that has not started yet can be cancelled.');
  await query("INSERT INTO lead_activities (lead_id, user_id, type, meta) VALUES (?, ?, 'AI_CALL_CANCELLED', ?)", [call.lead_id, req.auth.user.id, JSON.stringify({ callId })]);
}

/* ---------------- Sweep: place due calls ---------------- */
export async function runAiCallSweep() {
  await query(
    `UPDATE ai_calls SET status = 'FAILED', ended_at = NOW(3), error = 'No result received from the provider within 30 minutes'
     WHERE status IN ('DIALING','IN_PROGRESS') AND updated_at < NOW(3) - INTERVAL 30 MINUTE`,
  );
  const due = await query("SELECT id FROM ai_calls WHERE status = 'SCHEDULED' AND scheduled_at <= NOW(3) ORDER BY scheduled_at LIMIT 10");
  for (const { id } of due) {
    try { await claimAndPlace(id); } catch (err) { logger.error({ callId: id, err: err.message }, 'AI call placement failed'); }
  }
  if (due.length) logger.info({ calls: due.length }, 'AI call sweep');
}

async function claimAndPlace(callId) {
  const claimed = await query("UPDATE ai_calls SET status = 'DIALING' WHERE id = ? AND status = 'SCHEDULED'", [callId]);
  if (!claimed.affectedRows) return;
  const call = await one('SELECT * FROM ai_calls WHERE id = ?', [callId]);
  const cfg = await getConfig();
  const lead = await loadLead(call.lead_id);
  const manual = call.trigger_type === 'MANUAL';

  const reason = await ineligibility(lead, cfg, { manual });
  if (reason) {
    await query("UPDATE ai_calls SET status = 'SKIPPED', skip_reason = ? WHERE id = ?", [reason, callId]);
    return;
  }
  const now = new Date();
  if (!inCallingWindow(now, cfg.windowStart, cfg.windowEnd)) {
    await query("UPDATE ai_calls SET status = 'SCHEDULED', scheduled_at = ? WHERE id = ?", [nextWindowStart(now, cfg.windowStart), callId]);
    return;
  }
  const provider = getProvider(cfg.provider);
  if (!provider.configured()) {
    await query("UPDATE ai_calls SET status = 'FAILED', provider = ?, error = ? WHERE id = ?", [provider.id, `${provider.label} is not configured (missing ${provider.missing().join(', ')})`, callId]);
    return;
  }

  const brand = lead.website_name || lead.website_code;
  const profile = profileFor(cfg, lead.website_code);
  const vars = {
    lead_name: lead.name || '',
    first_name: String(lead.name || '').trim().split(/\s+/)[0] || '',
    brand,
    project: lead.interest || lead.form_type || '',
    city: lead.location || '',
    enquiry_message: String(lead.message || '').slice(0, 300),
    language: cfg.language,
    questions: profile.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
    website_code: lead.website_code,
    call_id: String(callId),
  };
  vars.opening_line = fillTemplate(profile.openingLine, { name: vars.first_name, brand, project: vars.project, city: vars.city });

  await query('UPDATE ai_calls SET provider = ? WHERE id = ?', [provider.id, callId]);
  try {
    const { providerCallId } = await provider.startCall(
      { aiCallId: callId, leadId: lead.id, attempt: call.attempt, to: call.to_phone, name: lead.name, variables: vars, agentId: profile.agentId },
      (result) => handleResult(provider.id, result).catch((e) => logger.error({ err: e.message }, 'AI call result failed')),
    );
    await query('UPDATE ai_calls SET provider_call_id = ? WHERE id = ?', [providerCallId, callId]);
    await query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'AI_CALL_STARTED', ?)", [lead.id, JSON.stringify({ callId, attempt: call.attempt, provider: provider.id })]);
  } catch (err) {
    await query("UPDATE ai_calls SET status = 'FAILED', ended_at = NOW(3), error = ? WHERE id = ?", [String(err.message).slice(0, 1000), callId]);
    logger.error({ callId, provider: provider.id, err: err.message }, 'AI call could not be started');
  }
}

/* ---------------- Results ---------------- */

/** Webhook entry: parse the provider's payload and apply it. Returns false when the payload isn't for a known call. */
export async function handleWebhook(providerId, body) {
  const provider = getProvider(providerId);
  const result = provider.parseResult(body);
  if (!result) return false;
  return handleResult(providerId, result);
}

export async function handleResult(providerId, r) {
  let call = await one('SELECT * FROM ai_calls WHERE provider = ? AND provider_call_id = ?', [providerId, String(r.providerCallId)]);
  if (!call && r.aiCallId && /^\d+$/.test(String(r.aiCallId))) {
    call = await one('SELECT * FROM ai_calls WHERE id = ? AND provider = ?', [Number(r.aiCallId), providerId]);
  }
  if (!call) { logger.warn({ providerId, providerCallId: r.providerCallId }, 'AI call result for an unknown call'); return false; }
  const open = ['DIALING', 'IN_PROGRESS'].includes(call.status) || (call.status === 'FAILED' && /^No result received/.test(call.error || ''));
  if (!open) return true; // already applied (providers retry webhooks)

  if (!r.final) {
    if (r.inProgress) await query("UPDATE ai_calls SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW(3)), provider_call_id = COALESCE(provider_call_id, ?) WHERE id = ?", [String(r.providerCallId), call.id]);
    return true;
  }

  let status = statusFromEnd(r.endedReason);
  if (status === 'COMPLETED' && !r.transcript && (r.durationSeconds ?? 0) < 5) status = 'NO_ANSWER';
  const answers = normalizeAnswers(r.answers);
  const outcome = status === 'COMPLETED' ? deriveOutcome(answers) : null;
  await query(
    `UPDATE ai_calls SET status = ?, provider_call_id = COALESCE(provider_call_id, ?), started_at = COALESCE(?, started_at), ended_at = COALESCE(?, NOW(3)),
       duration_seconds = ?, ended_reason = ?, outcome = ?, summary = ?, transcript = ?, extracted = ?, recording_url = ?, cost_amount = ?, cost_currency = ?, error = NULL
     WHERE id = ?`,
    [status, String(r.providerCallId), r.startedAt || null, r.endedAt || null, r.durationSeconds ?? null, r.endedReason ? String(r.endedReason).slice(0, 120) : null,
      outcome, r.summary ? String(r.summary).slice(0, 5000) : null, r.transcript ? String(r.transcript).slice(0, 200_000) : null,
      Object.keys(answers).length ? JSON.stringify(answers) : null, r.recordingUrl ? String(r.recordingUrl).slice(0, 1000) : null,
      r.cost?.amount ?? null, r.cost?.currency ?? null, call.id],
  );
  if (r.recordingUrl) saveRecording(call.id, r.recordingUrl).catch((e) => logger.warn({ callId: call.id, err: e.message }, 'Recording download failed'));
  await afterCall({ ...call, status }, { status, outcome, answers, summary: r.summary });
  return true;
}

async function afterCall(call, { status, outcome, answers, summary }) {
  const cfg = await getConfig();
  const lead = await loadLead(call.lead_id);
  if (!lead) return;
  const name = lead.name || 'Unnamed lead';
  const link = `/crm/leads/${lead.id}`;
  const recipients = lead.assigned_user_id
    ? [lead.assigned_user_id]
    : (await userRepo.usersWithPermission('lead.assign', lead.website_id)).map((u) => u.id);

  if (status === 'COMPLETED') {
    await query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'AI_CALL_COMPLETED', ?)", [lead.id, JSON.stringify({ callId: call.id, outcome, summary: summary ? String(summary).slice(0, 500) : null })]);
    if (outcome === 'DO_NOT_CALL') await query('UPDATE leads SET do_not_call = 1 WHERE id = ?', [lead.id]);
    if (answers.callbackTime && lead.assigned_user_id && outcome !== 'DO_NOT_CALL' && outcome !== 'NOT_INTERESTED') {
      const due = plannedCallTime(new Date(), cfg, 120);
      await query(
        "INSERT INTO lead_followups (lead_id, user_id, created_by, due_at, notes, priority) VALUES (?, ?, NULL, ?, ?, 'HIGH')",
        [lead.id, lead.assigned_user_id, due, `Call back requested on the AI call. Customer said: "${String(answers.callbackTime).slice(0, 200)}"`],
      );
      await query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'FOLLOWUP_CREATED', ?)", [lead.id, JSON.stringify({ dueAt: due, by: 'ai_call' })]);
    }
    await notificationService.notifyMany(recipients, {
      type: 'AI_CALL_RESULT', title: `AI call: ${OUTCOME_LABEL[outcome] || 'Completed'} · ${name}`,
      body: summary ? String(summary).slice(0, 400) : 'Open the lead to listen to the call.', link, data: { leadId: lead.id, callId: call.id, outcome },
    });
    return;
  }

  const unreached = status === 'NO_ANSWER' || status === 'BUSY';
  const wait = unreached ? retryDelay(call.attempt, cfg) : null;
  const stillOk = wait !== null && !(await ineligibility(lead, cfg, { manual: call.trigger_type === 'MANUAL' }));
  if (stillOk) {
    const at = plannedCallTime(new Date(), cfg, wait);
    await query(
      "INSERT INTO ai_calls (lead_id, attempt, status, trigger_type, scheduled_at, to_phone, created_by) VALUES (?, ?, 'SCHEDULED', ?, ?, ?, ?)",
      [lead.id, call.attempt + 1, call.trigger_type, at, call.to_phone, call.created_by],
    );
    await query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'AI_CALL_UNANSWERED', ?)", [lead.id, JSON.stringify({ callId: call.id, attempt: call.attempt, status, retryAt: at })]);
    return;
  }
  await query("INSERT INTO lead_activities (lead_id, type, meta) VALUES (?, 'AI_CALL_UNANSWERED', ?)", [lead.id, JSON.stringify({ callId: call.id, attempt: call.attempt, status, final: true })]);
  if (unreached) {
    await notificationService.notifyMany(recipients, {
      type: 'AI_CALL_RESULT', title: `AI agent couldn't reach ${name}`,
      body: `No answer after ${call.attempt} attempt${call.attempt > 1 ? 's' : ''}. Please try calling yourself.`, link, data: { leadId: lead.id, callId: call.id },
    });
  }
}

/* ---------------- Recordings ---------------- */
const recordingsDir = () => path.resolve(process.cwd(), env.AI_CALL_RECORDINGS_DIR);
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mp4': 'm4a' };
const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4' };
const MAX_BYTES = 100 * 1024 * 1024;

async function saveRecording(callId, url) {
  if (!/^https:\/\//i.test(url)) return;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('Recording too large');
  const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = EXT[type] || (/\.(mp3|wav|ogg|webm|m4a)(\?|$)/i.exec(url)?.[1]?.toLowerCase()) || 'mp3';
  await fs.promises.mkdir(recordingsDir(), { recursive: true });
  const file = `call-${Number(callId)}.${ext}`;
  const tmp = path.join(recordingsDir(), `${file}.part`);
  let bytes = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => { bytes += chunk.length; if (bytes > MAX_BYTES) body.destroy(new Error('Recording too large')); });
  await pipeline(body, fs.createWriteStream(tmp));
  await fs.promises.rename(tmp, path.join(recordingsDir(), file));
  await query('UPDATE ai_calls SET recording_path = ? WHERE id = ?', [file, callId]);
}

/** Streams a call recording to an authorised user: our copy when we have it, else proxied from the provider. */
export async function streamRecording(req, res, callId) {
  const call = await one('SELECT id, lead_id, recording_path, recording_url FROM ai_calls WHERE id = ?', [callId]);
  if (!call) throw notFound('Call not found');
  await loadVisibleLead(req, call.lead_id);
  if (call.recording_path && /^call-\d+\.(mp3|wav|ogg|webm|m4a)$/.test(call.recording_path)) {
    const abs = path.join(recordingsDir(), call.recording_path);
    if (fs.existsSync(abs)) {
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.sendFile(abs, { headers: { 'Content-Type': MIME[path.extname(abs).slice(1)] || 'audio/mpeg' } });
    }
  }
  if (!call.recording_url || !/^https:\/\//i.test(call.recording_url)) throw notFound('No recording for this call');
  const up = await fetch(call.recording_url, { signal: AbortSignal.timeout(60_000) });
  if (!up.ok || !up.body) throw notFound('The provider no longer has this recording');
  res.setHeader('Content-Type', up.headers.get('content-type') || 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  await pipeline(Readable.fromWeb(up.body), res);
  return undefined;
}

/* ---------------- Reads ---------------- */
const parseJson = (v) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const publicRow = (c) => ({
  id: c.id, lead_id: c.lead_id, attempt: c.attempt, status: c.status, trigger_type: c.trigger_type, scheduled_at: c.scheduled_at,
  provider: c.provider, started_at: c.started_at, ended_at: c.ended_at, duration_seconds: c.duration_seconds, ended_reason: c.ended_reason,
  outcome: c.outcome, outcome_label: OUTCOME_LABEL[c.outcome] || null, summary: c.summary, transcript: c.transcript, answers: parseJson(c.extracted) || {},
  has_recording: Boolean(c.recording_path || c.recording_url), skip_reason: c.skip_reason, skip_label: SKIP_LABEL[c.skip_reason] || null,
  error: c.error, created_by_name: c.created_by_name || null, created_at: c.created_at,
});

export async function listForLead(req, leadId) {
  const lead = await loadVisibleLead(req, leadId);
  const rows = await query(
    'SELECT c.*, u.full_name AS created_by_name FROM ai_calls c LEFT JOIN users u ON u.id = c.created_by WHERE c.lead_id = ? ORDER BY c.id DESC LIMIT 50', [leadId],
  );
  const cfg = await getConfig();
  const provider = getProvider(cfg.provider);
  return { calls: rows.map(publicRow), doNotCall: Boolean(lead.do_not_call), canCall: provider.configured(), provider: provider.id };
}

export async function overview() {
  const cfg = await getConfig();
  const [stats, recent] = await Promise.all([
    query(
      `SELECT status, outcome, COUNT(*) n, COALESCE(SUM(duration_seconds), 0) secs FROM ai_calls
       WHERE created_at > NOW(3) - INTERVAL 30 DAY GROUP BY status, outcome`,
    ),
    query(
      `SELECT c.*, l.name AS lead_name, w.code AS website_code FROM ai_calls c JOIN leads l ON l.id = c.lead_id JOIN websites w ON w.id = l.website_id
       ORDER BY c.id DESC LIMIT 50`,
    ),
  ]);
  const base = (env.PUBLIC_API_URL || env.APP_URL).replace(/\/$/, '');
  return {
    config: cfg,
    providers: providerList(),
    webhook: { secretConfigured: Boolean(env.AI_CALL_WEBHOOK_SECRET), urlTemplate: `${base}/api/integrations/aicall/{provider}/webhook?token=<AI_CALL_WEBHOOK_SECRET>` },
    stats: stats.map((s) => ({ status: s.status, outcome: s.outcome, count: Number(s.n), seconds: Number(s.secs) })),
    recent: recent.map((c) => ({ ...publicRow(c), transcript: undefined, lead_name: c.lead_name, website_code: c.website_code })),
  };
}
