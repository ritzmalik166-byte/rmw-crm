/**
 * Voice-AI providers for the calling agent. Each adapter:
 *   configured()              → true when its env keys are present
 *   startCall(input)          → { providerCallId }   (places the call)
 *   parseResult(body)         → null (ignore) or a normalised result (see below)
 *
 * Normalised result: { providerCallId, aiCallId?, final, endedReason?, startedAt?, endedAt?, durationSeconds?,
 *                      transcript?, summary?, answers?, recordingUrl?, cost? }
 *
 * The Vapi and Bolna field names follow their public docs; parsing is defensive (several paths per field) because
 * both evolve. Verify against a real call in each provider's dashboard before going live.
 */
import { env, isProd } from '../../config/env.js';
import { badRequest } from '../../utils/errors.js';
import { transcriptText } from './aiCall.logic.js';

const pick = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '');
const iso = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

async function postJson(url, key, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || text.slice(0, 300) || `HTTP ${res.status}`;
    throw new Error(`Provider rejected the call (${res.status}): ${Array.isArray(msg) ? msg.join('; ') : msg}`);
  }
  return json || {};
}

/* ---------------- Vapi ---------------- */
const vapi = {
  id: 'vapi',
  label: 'Vapi',
  missing: () => ['VAPI_API_KEY', 'VAPI_ASSISTANT_ID', 'VAPI_PHONE_NUMBER_ID'].filter((k) => !env[k]),
  configured() { return this.missing().length === 0; },
  async startCall({ aiCallId, leadId, to, name, variables, agentId }) {
    const r = await postJson('https://api.vapi.ai/call', env.VAPI_API_KEY, {
      assistantId: agentId || env.VAPI_ASSISTANT_ID,
      phoneNumberId: env.VAPI_PHONE_NUMBER_ID,
      customer: { number: to, ...(name ? { name: String(name).slice(0, 40) } : {}) },
      assistantOverrides: { variableValues: variables },
      metadata: { aiCallId: String(aiCallId), leadId: String(leadId) },
    });
    if (!r.id) throw new Error('Vapi did not return a call id');
    return { providerCallId: String(r.id) };
  },
  parseResult(body) {
    const m = body?.message || body;
    const call = m?.call || {};
    const providerCallId = pick(call.id, m?.callId);
    if (!providerCallId) return null;
    const aiCallId = pick(call.metadata?.aiCallId, m?.metadata?.aiCallId);
    if (m.type === 'status-update') {
      return { providerCallId, aiCallId, final: false, inProgress: m.status === 'in-progress' };
    }
    if (m.type !== 'end-of-call-report') return null;
    const art = m.artifact || {};
    const startedAt = iso(pick(m.startedAt, call.startedAt));
    const endedAt = iso(pick(m.endedAt, call.endedAt));
    return {
      providerCallId, aiCallId, final: true,
      endedReason: pick(m.endedReason, call.endedReason),
      startedAt, endedAt,
      durationSeconds: pick(m.durationSeconds, startedAt && endedAt ? Math.round((endedAt - startedAt) / 1000) : undefined),
      transcript: transcriptText(pick(art.transcript, m.transcript, art.messages, m.messages)),
      summary: pick(m.analysis?.summary, m.summary),
      answers: pick(m.analysis?.structuredData, art.structuredOutputs, {}),
      recordingUrl: pick(art.recordingUrl, art.recording?.mono?.combinedUrl, art.recording?.stereoUrl, m.recordingUrl, m.stereoRecordingUrl),
      cost: typeof m.cost === 'number' ? { amount: m.cost, currency: 'USD' } : null,
    };
  },
};

/* ---------------- Bolna ---------------- */
const bolna = {
  id: 'bolna',
  label: 'Bolna',
  missing: () => ['BOLNA_API_KEY', 'BOLNA_AGENT_ID'].filter((k) => !env[k]),
  configured() { return this.missing().length === 0; },
  async startCall({ aiCallId, leadId, to, variables, agentId }) {
    const r = await postJson('https://api.bolna.ai/call', env.BOLNA_API_KEY, {
      agent_id: agentId || env.BOLNA_AGENT_ID,
      recipient_phone_number: to,
      ...(env.BOLNA_FROM_NUMBER ? { from_phone_number: env.BOLNA_FROM_NUMBER } : {}),
      user_data: { ...variables, ai_call_id: String(aiCallId), lead_id: String(leadId) },
    });
    const id = pick(r.execution_id, r.executionId, r.call_id, r.id);
    if (!id) throw new Error('Bolna did not return an execution id');
    return { providerCallId: String(id) };
  },
  /** Pulls an execution from Bolna's API (GET /executions/{id}) and normalises it like a webhook. */
  async fetchResult(executionId) {
    const res = await fetch(`https://api.bolna.ai/executions/${encodeURIComponent(executionId)}`, {
      headers: { Authorization: `Bearer ${env.BOLNA_API_KEY}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Bolna execution lookup failed (HTTP ${res.status})`);
    const r = this.parseResult(await res.json());
    if (r && !r.providerCallId) r.providerCallId = String(executionId);
    return r;
  },
  parseResult(body) {
    const b = body?.data || body;
    const providerCallId = pick(b?.execution_id, b?.id, b?.call_id);
    if (!providerCallId) return null;
    const status = String(b.status || b.call_status || '').toLowerCase();
    const tel = b.telephony_data || {};
    const userData = b.context_details?.recipient_data || b.user_data || {};
    const final = /complete|disconnect|no-answer|no_answer|busy|fail|cancel|error|stopped|ended/.test(status);
    if (!final) return { providerCallId, aiCallId: userData.ai_call_id, final: false, inProgress: /progress|answered/.test(status) };
    return {
      providerCallId, aiCallId: userData.ai_call_id, final: true,
      endedReason: /complete|disconnect|ended/.test(status) ? pick(tel.hangup_reason, status) : status,
      durationSeconds: Number(pick(tel.duration, b.conversation_duration, b.duration)) || undefined,
      startedAt: iso(b.initiated_at || b.created_at),
      transcript: transcriptText(b.transcript),
      summary: b.summary,
      answers: (typeof b.extracted_data === 'string' ? safeJson(b.extracted_data) : b.extracted_data) || {},
      recordingUrl: pick(tel.recording_url, b.recording_url),
      cost: null, // Bolna reports cost in its dashboard; not converted here
    };
  },
};
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

/* ---------------- Simulator ---------------- */
// Never dials. Produces a realistic result ~8 seconds later so the whole flow (retries, notes, notifications, UI)
// can be tested before a provider is bought. Results are labelled "Simulated" in the UI.
const SIM_ANSWERS = [
  { interested: 'yes', configuration: '3 BHK', budget: '₹1.2–1.5 Cr', location: 'Sector 150, Noida', purpose: 'Self-use', timeline: 'Within 3 months', siteVisit: 'Saturday', callbackTime: 'Evening after 6 pm' },
  { interested: 'yes', configuration: '2 BHK', budget: '₹70–80 L', location: 'Greater Noida West', purpose: 'Investment', timeline: 'Within 6 months', siteVisit: 'Not now', callbackTime: 'Tomorrow 11 am' },
  { interested: 'no', notes: 'Already bought a flat last month' },
];
const pending = new Map();
const simulator = {
  id: 'simulator',
  label: 'Simulator (no real calls)',
  missing: () => (isProd && !env.AI_CALL_ALLOW_SIMULATOR ? ['AI_CALL_ALLOW_SIMULATOR'] : []),
  configured() { return this.missing().length === 0; },
  async startCall({ aiCallId, leadId, attempt, name, variables }, deliver) {
    const providerCallId = `sim-${aiCallId}`;
    const noAnswer = leadId % 4 === 0 && attempt === 1; // every 4th lead misses the first call, to exercise retries
    const t = setTimeout(() => {
      pending.delete(providerCallId);
      const startedAt = new Date(Date.now() - 95_000);
      const a = SIM_ANSWERS[leadId % SIM_ANSWERS.length];
      deliver(noAnswer ? { providerCallId, final: true, endedReason: 'customer-did-not-answer' } : {
        providerCallId, final: true, endedReason: 'customer-ended-call', startedAt, endedAt: new Date(), durationSeconds: 95,
        summary: a.interested === 'yes'
          ? `${name || 'The customer'} is interested in ${variables.project}: ${a.configuration}, budget ${a.budget}, prefers ${a.location}. ${a.purpose}, buying ${a.timeline.toLowerCase()}. Site visit: ${a.siteVisit}. Call back: ${a.callbackTime}.`
          : `${name || 'The customer'} is not interested: ${a.notes}.`,
        transcript: [
          `Agent: ${variables.opening_line}`,
          'Customer: Haan, boliye.',
          ...(a.interested === 'yes'
            ? [`Agent: Which configuration are you looking for?`, `Customer: ${a.configuration}.`, 'Agent: And your budget range?', `Customer: ${a.budget}.`, `Agent: Would you like a site visit?`, `Customer: ${a.siteVisit}.`, 'Agent: Thank you, our property advisor will call you back.']
            : ['Agent: Are you still looking for a property?', `Customer: Nahi, ${a.notes.toLowerCase()}.`, 'Agent: Understood, thank you for your time.']),
        ].join('\n'),
        answers: a,
        recordingUrl: null,
      });
    }, 8_000);
    t.unref?.();
    pending.set(providerCallId, t);
    return { providerCallId };
  },
  parseResult: (body) => body,
};

export const PROVIDERS = { simulator, vapi, bolna };

export function getProvider(id) {
  const p = PROVIDERS[id];
  if (!p) throw badRequest(`Unknown AI calling provider "${id}"`);
  return p;
}

export function providerList() {
  return Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, configured: p.configured(), missing: p.missing() }));
}
