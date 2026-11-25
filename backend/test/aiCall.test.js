import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConfig, inCallingWindow, nextWindowStart, plannedCallTime, toIndianMobileE164, fillTemplate, retryDelay,
  normalizeAnswers, deriveOutcome, statusFromEnd, transcriptText, DEFAULT_CONFIG, profileFor,
} from '../src/integrations/aicall/aiCall.logic.js';
import { PROVIDERS } from '../src/integrations/aicall/providers.js';

// 2026-11-24 10:00 IST = 04:30 UTC
const ist = (h, m = 0, day = 24) => new Date(Date.UTC(2026, 10, day, h, m) - 330 * 60_000);

test('calling window is checked in IST', () => {
  assert.equal(inCallingWindow(ist(10), '09:00', '21:00'), true);
  assert.equal(inCallingWindow(ist(8, 59), '09:00', '21:00'), false);
  assert.equal(inCallingWindow(ist(21, 0), '09:00', '21:00'), false);
  assert.equal(inCallingWindow(ist(23), '22:00', '02:00'), true); // window across midnight
});

test('next window start rolls to the next morning', () => {
  assert.equal(nextWindowStart(ist(22), '09:00').getTime(), ist(9, 0, 25).getTime());
  assert.equal(nextWindowStart(ist(7), '09:00').getTime(), ist(9).getTime());
});

test('planned call time: now + delay, or next window opening', () => {
  const cfg = resolveConfig({});
  assert.equal(plannedCallTime(ist(10), cfg).getTime(), ist(10, 5).getTime());
  assert.equal(plannedCallTime(ist(20, 58), cfg).getTime(), ist(9, 0, 25).getTime());
});

test('only Indian mobiles are callable', () => {
  assert.equal(toIndianMobileE164('+91 98765 43210'), '+919876543210');
  assert.equal(toIndianMobileE164('09876543210'), '+919876543210');
  assert.equal(toIndianMobileE164('0120-4567890'), null);
  assert.equal(toIndianMobileE164('12345'), null);
  assert.equal(toIndianMobileE164(null), null);
});

test('template fills lead details with safe defaults', () => {
  assert.equal(fillTemplate('Hi {name}, about {project}', { name: 'Ravi', project: '' }), 'Hi Ravi, about your property enquiry');
});

test('retry plan follows attempts and stops at the max', () => {
  const cfg = resolveConfig({ maxAttempts: 3, retryMinutes: [30, 120] });
  assert.equal(retryDelay(1, cfg), 30);
  assert.equal(retryDelay(2, cfg), 120);
  assert.equal(retryDelay(3, cfg), null);
});

test('config is clamped and defaults fill gaps', () => {
  const c = resolveConfig({ delayMinutes: 0, windowStart: '25:00', maxAttempts: 99 });
  assert.equal(c.delayMinutes, 1);
  assert.equal(c.windowStart, DEFAULT_CONFIG.windowStart);
  assert.equal(c.maxAttempts, 5);
});

test('answers are normalised from different provider field names', () => {
  const a = normalizeAnswers({ BHK: '3 BHK', budget_range: '1 Cr', best_time_to_call: 'evening', is_interested: 'haan' });
  assert.deepEqual(a, { interested: 'haan', configuration: '3 BHK', budget: '1 Cr', callbackTime: 'evening' });
});

test('Bolna Auto Build field names are understood', () => {
  assert.deepEqual(normalizeAnswers({ bhk_type: '3 BHK', site_visit_interest: 'yes, Sunday' }), { configuration: '3 BHK', siteVisit: 'yes, Sunday' });
});

test('each website can have its own agent and script', () => {
  const cfg = resolveConfig({ profiles: { RMW: { agentId: 'rmw-agent-1', questions: ['Which service?'], openingLine: '' } } });
  assert.deepEqual(profileFor(cfg, 'RMW'), { agentId: 'rmw-agent-1', openingLine: cfg.openingLine, questions: ['Which service?'] });
  assert.equal(profileFor(cfg, 'MPF').agentId, null);
  assert.deepEqual(profileFor(cfg, 'MPF').questions, cfg.questions);
  assert.equal(resolveConfig({ profiles: { RMW: { agentId: 'bad id;' } } }).profiles.RMW.agentId, '');
});

test('B2B answers from RMW calls are understood', () => {
  assert.deepEqual(
    normalizeAnswers({ service_interest: 'SEO', company_name: 'Acme', monthly_budget: '50k', meeting_time: 'Monday 11 am' }),
    { service: 'SEO', company: 'Acme', budget: '50k', callbackTime: 'Monday 11 am' },
  );
});

test('outcome: opt-out wins, then interest, then callback', () => {
  assert.equal(deriveOutcome({ interested: 'yes', optOut: true }), 'DO_NOT_CALL');
  assert.equal(deriveOutcome({ interested: 'no' }), 'NOT_INTERESTED');
  assert.equal(deriveOutcome({ interested: 'yes', callbackTime: '6 pm' }), 'INTERESTED');
  assert.equal(deriveOutcome({ callbackTime: 'tomorrow' }), 'CALLBACK');
  assert.equal(deriveOutcome({ outcome: 'wrong number' }), 'WRONG_NUMBER');
  assert.equal(deriveOutcome({}), 'UNCLEAR');
});

test('end reasons map to call statuses', () => {
  assert.equal(statusFromEnd('customer-did-not-answer'), 'NO_ANSWER');
  assert.equal(statusFromEnd('customer-busy'), 'BUSY');
  assert.equal(statusFromEnd('voicemail'), 'NO_ANSWER');
  assert.equal(statusFromEnd('twilio-failed-to-connect-call'), 'FAILED');
  assert.equal(statusFromEnd('customer-ended-call'), 'COMPLETED');
  assert.equal(statusFromEnd('no-answer'), 'NO_ANSWER');
});

test('transcript turns become readable lines', () => {
  assert.equal(transcriptText([{ role: 'system', message: 'x' }, { role: 'bot', message: 'Hello' }, { role: 'user', message: 'Haan' }]), 'Agent: Hello\nCustomer: Haan');
});

test('Vapi end-of-call report is parsed', () => {
  const r = PROVIDERS.vapi.parseResult({ message: {
    type: 'end-of-call-report', endedReason: 'customer-ended-call', call: { id: 'c1', metadata: { aiCallId: '7' } },
    startedAt: '2026-11-24T05:00:00Z', endedAt: '2026-11-24T05:02:00Z', cost: 0.21,
    artifact: { transcript: 'AI: hi\nUser: hello', recordingUrl: 'https://x/rec.wav' }, analysis: { summary: 'ok', structuredData: { bhk: '2 BHK' } },
  } });
  assert.equal(r.providerCallId, 'c1');
  assert.equal(r.aiCallId, '7');
  assert.equal(r.final, true);
  assert.equal(r.durationSeconds, 120);
  assert.equal(r.recordingUrl, 'https://x/rec.wav');
  assert.deepEqual(r.answers, { bhk: '2 BHK' });
  assert.deepEqual(r.cost, { amount: 0.21, currency: 'USD' });
  assert.equal(PROVIDERS.vapi.parseResult({ message: { type: 'speech-update', call: { id: 'c1' } } }), null);
});

test('Bolna execution result is parsed', () => {
  const r = PROVIDERS.bolna.parseResult({
    id: 'e1', status: 'completed', transcript: 'assistant: hi', extracted_data: { budget: '80 L' },
    telephony_data: { duration: '64', recording_url: 'https://x/r.mp3', hangup_reason: 'Call recipient hungup' },
    context_details: { recipient_data: { ai_call_id: '9' } },
  });
  assert.equal(r.providerCallId, 'e1');
  assert.equal(r.aiCallId, '9');
  assert.equal(r.final, true);
  assert.equal(r.durationSeconds, 64);
  assert.equal(r.recordingUrl, 'https://x/r.mp3');
  assert.equal(PROVIDERS.bolna.parseResult({ id: 'e1', status: 'no-answer' }).endedReason, 'no-answer');
  assert.equal(PROVIDERS.bolna.parseResult({ id: 'e1', status: 'in-progress' }).final, false);
});
