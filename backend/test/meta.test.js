import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.DB_HOST ||= 'x'; process.env.DB_NAME ||= 'x'; process.env.DB_USER ||= 'x'; process.env.DB_PASSWORD ||= 'x';
process.env.APP_ENCRYPTION_KEY ||= 'test-encryption-key-at-least-32-characters';
process.env.OTP_SECRET ||= 'test-otp-secret-at-least-32-characters-long';
process.env.META_APP_ID = '1234567890';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_REDIRECT_URI = 'https://crm.example.com/api/integrations/meta/oauth/callback';
process.env.META_API_VERSION = 'v23.0';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-token-123';
process.env.META_LOGIN_CONFIG_ID = ''; // test the scope-based dialog regardless of the local .env
process.env.LOG_LEVEL = 'silent';

const { normalizeMetaLead, parseFieldData, sanitizeValue } = await import('../src/integrations/meta/metaLead.service.js');
const { verifySubscription, isValidSignature, extractLeadgenChanges } = await import('../src/integrations/meta/metaWebhook.service.js');
const { graph, graphPaged, classifyMetaError, MetaApiError, appSecretProof } = await import('../src/integrations/meta/metaApi.service.js');
const { buildAuthUrl, parseCallbackQuery, exchangeCodeForToken, missingScopes } = await import('../src/integrations/meta/metaAuth.service.js');
const { buildConversionEvent, hashPhone } = await import('../src/integrations/meta/metaConversion.service.js');
const { funnelFromCounts } = await import('../src/integrations/meta/metaAnalytics.service.js');
const { connectionState } = await import('../src/integrations/meta/metaStatus.service.js');
const { leadsSinceFilter, syncWindowStart } = await import('../src/integrations/meta/metaSync.service.js');
const { findExistingLead } = await import('../src/services/duplicateDetectionService.js');
const { pickAssignee } = await import('../src/services/leadAssignmentService.js');
const { conversionTypeFor } = await import('../src/services/conversionService.js');
const { scrubMeta } = await import('../src/services/integrationLogService.js');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** Queue of canned fetch responses; records requested URLs. */
function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(String(url)));
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status || 200 });
  };
  return calls;
}

const LEAD = {
  id: '1234567890123456', created_time: '2026-11-16T08:45:00+0000', platform: 'fb', is_organic: false,
  campaign_id: '120200000001', campaign_name: 'Noida 3BHK Campaign', adset_id: '120200000002', adset_name: 'Noida High Intent',
  ad_id: '120200000003', ad_name: '3BHK Creative 02', form_id: '987654321',
  field_data: [
    { name: 'full_name', values: ['Rahul Sharma'] },
    { name: 'phone_number', values: ['+919876543211'] },
    { name: 'email', values: ['Rahul@Gmail.com'] },
    { name: 'what_is_your_requirement?', values: ['3 BHK'] },
    { name: 'budget', values: ['1.2 Cr'] },
    { name: 'preferred_location', values: ['Noida'] },
  ],
};

describe('lead normalisation', () => {
  test('new lead: contact, custom answers and campaign attribution', () => {
    const c = normalizeMetaLead(LEAD, { pageId: '555', formName: 'Noida Enquiry Form' });
    assert.equal(c.sourceType, 'META');
    assert.equal(c.sourceLeadId, LEAD.id);
    assert.equal(c.externalRawId, `META-${LEAD.id}`);
    assert.equal(c.externalLeadId, `META-${LEAD.id}`); // no MPF- prefix
    assert.equal(c.name, 'Rahul Sharma');
    assert.equal(c.phone, '+919876543211');
    assert.equal(c.email, 'rahul@gmail.com');
    assert.equal(c.interest, '3 BHK');
    assert.equal(c.location, 'Noida');
    assert.equal(c.externalMetadata.budget, '1.2 Cr');
    assert.deepEqual(c.ad, {
      campaignId: '120200000001', campaignName: 'Noida 3BHK Campaign', adSetId: '120200000002', adSetName: 'Noida High Intent',
      adId: '120200000003', adName: '3BHK Creative 02', formId: '987654321', formName: 'Noida Enquiry Form', pageId: '555', instagramAccountId: null,
    });
    assert.deepEqual(c.attributionOverride, { source: 'facebook', medium: 'paid_social', campaign: 'Noida 3BHK Campaign', term: 'Noida High Intent', content: '3BHK Creative 02' });
    assert.equal(c.externalCreatedAt.toISOString(), '2026-11-16T08:45:00.000Z');
    assert.equal(c.receivedActivity.type, 'META_LEAD_RECEIVED');
    assert.equal(c.notify.title, 'New Meta Lead Received');
    assert.match(c.notify.body, /Rahul Sharma · 3 BHK - Noida · Campaign: Noida 3BHK Campaign/);
  });

  test('missing phone', () => {
    const c = normalizeMetaLead({ ...LEAD, field_data: LEAD.field_data.filter((f) => f.name !== 'phone_number') });
    assert.equal(c.phone, null);
    assert.equal(c.email, 'rahul@gmail.com');
  });

  test('missing email, first/last name, invalid email is not stored as email', () => {
    const c = normalizeMetaLead({ id: '42', field_data: [
      { name: 'first_name', values: ['Asha'] }, { name: 'last_name', values: ['Verma'] },
      { name: 'email', values: ['not-an-email'] }, { name: 'phone_number', values: ['9810000000'] },
    ] });
    assert.equal(c.name, 'Asha Verma');
    assert.equal(c.email, null);
    assert.equal(c.externalMetadata.formResponses.email, 'not-an-email'); // kept as an answer
  });

  test('multiple / unknown form fields are kept dynamically and sanitised', () => {
    const c = normalizeMetaLead({ id: '43', platform: 'ig', field_data: [
      { name: 'Full Name', values: ['Neha'] },
      { name: 'which_amenities_matter?', values: ['Pool', 'Gym', 'Clubhouse'] },
      { name: 'possession_timeline', values: ['Ready\u0000 to move'] },
    ] }, { instagramAccountId: '777' });
    assert.equal(c.externalMetadata.formResponses['which_amenities_matter?'], 'Pool, Gym, Clubhouse');
    assert.equal(c.externalMetadata.formResponses.possession_timeline, 'Ready to move');
    assert.equal(c.attributionOverride.source, 'instagram');
    assert.equal(c.ad.instagramAccountId, '777');
    assert.match(c.message, /Which amenities matter\?: Pool, Gym, Clubhouse/);
  });

  test('rejects a lead without a numeric id', () => {
    assert.throws(() => normalizeMetaLead({ id: 'abc', field_data: [] }), /valid id/);
  });

  test('field values are capped and control characters stripped', () => {
    assert.equal(sanitizeValue('a\u0007b'), 'ab');
    assert.equal(sanitizeValue('x'.repeat(5000)).length, 1000);
    assert.equal(parseFieldData(Array.from({ length: 300 }, (_, i) => ({ name: `q${i}`, values: ['v'] }))).length, 100);
  });
});

describe('webhook', () => {
  test('verification succeeds with the right token', () => {
    assert.equal(verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token-123', 'hub.challenge': '1158201444' }), '1158201444');
  });
  test('verification fails with a wrong token or mode', () => {
    assert.throws(() => verifySubscription({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' }), /verification failed/);
    assert.throws(() => verifySubscription({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'verify-token-123', 'hub.challenge': '1' }), /verification failed/);
  });
  test('signature: valid accepted, tampered/missing rejected', () => {
    const raw = Buffer.from('{"object":"page","entry":[]}');
    const sig = `sha256=${crypto.createHmac('sha256', 'test-app-secret').update(raw).digest('hex')}`;
    assert.equal(isValidSignature(raw, sig), true);
    assert.equal(isValidSignature(Buffer.from('{"object":"page","entry":[1]}'), sig), false);
    assert.equal(isValidSignature(raw, undefined), false);
    assert.equal(isValidSignature(raw, 'sha1=abc'), false);
  });
  test('lead event: leadgen changes extracted', () => {
    const r = extractLeadgenChanges({ object: 'page', entry: [{ id: '555', time: 1, changes: [
      { field: 'leadgen', value: { leadgen_id: '111', page_id: '555', form_id: '222', ad_id: '333', adgroup_id: '444', created_time: 1731746700 } },
    ] }] });
    assert.equal(r.ignored, 0);
    assert.deepEqual(r.changes[0], { leadgenId: '111', pageId: '555', formId: '222', adId: '333', adgroupId: '444', createdTime: 1731746700 });
  });
  test('invalid webhook payloads are ignored, not processed', () => {
    assert.deepEqual(extractLeadgenChanges({ object: 'user', entry: [] }).changes, []);
    assert.deepEqual(extractLeadgenChanges('nonsense').changes, []);
    const r = extractLeadgenChanges({ object: 'page', entry: [{ id: '1', changes: [
      { field: 'feed', value: {} }, { field: 'leadgen', value: { leadgen_id: "1; DROP TABLE leads", page_id: '1' } },
    ] }] });
    assert.equal(r.changes.length, 0);
    assert.equal(r.ignored, 2);
  });
});

describe('Graph API client', () => {
  test('adds appsecret_proof and version; returns JSON', async () => {
    const calls = mockFetch([{ body: { id: '1', name: 'Page' } }]);
    const r = await graph('555', { token: 'tok', params: { fields: 'id,name' } });
    assert.equal(r.name, 'Page');
    assert.equal(calls[0].pathname, '/v23.0/555');
    assert.equal(calls[0].searchParams.get('appsecret_proof'), appSecretProof('tok'));
  });
  test('API failure maps to MetaApiError without leaking the token', async () => {
    mockFetch([{ status: 500, body: { error: { message: 'Service temporarily unavailable access_token=SECRET', code: 2, fbtrace_id: 'x' } } }]);
    await assert.rejects(graph('me', { token: 'SECRET' }), (err) => err instanceof MetaApiError && err.errorCode === 'META_UNAVAILABLE' && err.isTransient && !err.message.includes('SECRET'));
  });
  test('network failure', async () => {
    mockFetch([new TypeError('fetch failed')]);
    await assert.rejects(graph('me', { token: 't' }), (err) => err.errorCode === 'META_NETWORK');
  });
  test('token expiration / permissions / rate limit classification', () => {
    assert.equal(classifyMetaError(190, 463, 'OAuthException'), 'META_TOKEN_INVALID');
    assert.equal(classifyMetaError(200, null, 'OAuthException'), 'META_PERMISSION_DENIED');
    assert.equal(classifyMetaError(17), 'META_RATE_LIMITED');
    assert.equal(classifyMetaError(100), 'META_INVALID_REQUEST');
    const e = new MetaApiError('x', { errorCode: 'META_TOKEN_INVALID' });
    assert.equal(e.isTokenError, true);
    assert.notEqual(e.status, 401); // 401 would sign the CRM user out
  });
  test('paging follows cursors', async () => {
    mockFetch([
      { body: { data: [{ id: 1 }, { id: 2 }], paging: { next: 'https://graph.facebook.com/v23.0/x/leads?after=abc&access_token=tok' } } },
      { body: { data: [{ id: 3 }] } },
    ]);
    const rows = await graphPaged('x/leads', { token: 'tok' });
    assert.deepEqual(rows.map((r) => r.id), [1, 2, 3]);
  });
});

describe('OAuth', () => {
  test('authorization URL carries app id, redirect, state and scopes', () => {
    const u = new URL(buildAuthUrl('state-abcdefghijklmnopqrstuvwxyz'));
    assert.equal(u.searchParams.get('client_id'), '1234567890');
    assert.equal(u.searchParams.get('redirect_uri'), process.env.META_REDIRECT_URI);
    assert.equal(u.searchParams.get('state'), 'state-abcdefghijklmnopqrstuvwxyz');
    assert.match(u.searchParams.get('scope'), /leads_retrieval/);
  });
  test('callback success parsing', () => {
    const state = 'A'.repeat(43);
    assert.deepEqual(parseCallbackQuery({ code: 'AQBx-yz_123', state }), { code: 'AQBx-yz_123', state });
  });
  test('callback failure: user denied, bad state, missing code', () => {
    assert.equal(parseCallbackQuery({ error: 'access_denied', error_reason: 'user_denied', state: 'x' }).error, 'ACCESS_DENIED');
    assert.equal(parseCallbackQuery({ code: 'abc', state: 'short' }).error, 'INVALID_STATE');
    assert.equal(parseCallbackQuery({ state: 'A'.repeat(43) }).error, 'INVALID_CODE');
  });
  test('code exchange: short-lived then long-lived token', async () => {
    const calls = mockFetch([{ body: { access_token: 'short', expires_in: 3600 } }, { body: { access_token: 'long', expires_in: 5184000 } }]);
    const r = await exchangeCodeForToken('the-code');
    assert.equal(r.token, 'long');
    assert.ok(r.expiresAt > new Date(Date.now() + 59 * 86400_000));
    assert.equal(calls[0].searchParams.get('code'), 'the-code');
    assert.equal(calls[1].searchParams.get('grant_type'), 'fb_exchange_token');
  });
  test('code exchange failure surfaces as MetaApiError', async () => {
    mockFetch([{ status: 400, body: { error: { message: 'Invalid verification code format.', type: 'OAuthException', code: 100 } } }]);
    await assert.rejects(exchangeCodeForToken('bad'), (err) => err instanceof MetaApiError);
  });
  test('missing scopes reported', () => {
    assert.ok(missingScopes(['pages_show_list']).includes('leads_retrieval'));
  });
});

/** Fake mysql2 connection: answers by matching SQL text. */
function fakeConn(handlers) {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      seen.push({ sql, params });
      for (const [re, rows] of handlers) if (re.test(sql)) return [typeof rows === 'function' ? rows(params) : rows];
      return [[]];
    },
  };
}

describe('duplicate detection', () => {
  test('priority 1: Meta lead id match = same lead', async () => {
    const conn = fakeConn([[/source_lead_id = \?/, [{ id: 9, source_lead_id: '111' }]]]);
    const r = await findExistingLead({ sourceType: 'META', sourceLeadId: '111', phoneN: '9876543211', emailN: 'a@b.com' }, conn);
    assert.equal(r.matchedBy, 'source_lead_id');
    assert.equal(r.lead.id, 9);
  });
  test('priority 2 and 3: phone before email', async () => {
    const conn = fakeConn([[/phone_normalized = \?/, [
      { id: 5, phone_normalized: null, email_normalized: 'a@b.com', website_id: 1 },
      { id: 4, phone_normalized: '9876543211', email_normalized: null, website_id: 1 },
    ]]]);
    const r = await findExistingLead({ sourceType: 'META', sourceLeadId: '112', phoneN: '9876543211', emailN: 'a@b.com' }, conn);
    assert.equal(r.matchedBy, 'phone');
    assert.equal(r.lead.id, 4);
    const byEmail = await findExistingLead({ sourceType: 'META', sourceLeadId: '113', phoneN: null, emailN: 'a@b.com' }, conn);
    assert.equal(byEmail.matchedBy, 'email');
  });
  test('new lead: no match', async () => {
    assert.equal(await findExistingLead({ sourceType: 'META', sourceLeadId: '114', phoneN: '9000000000', emailN: null }, fakeConn([])), null);
  });
});

describe('lead assignment', () => {
  test('team on the Meta connection: round robin inside that team', async () => {
    const conn = fakeConn([[/tm\.team_id = \?/, [{ id: 21, open_leads: 0 }]]]);
    assert.deepEqual(await pickAssignee({ websiteId: 1, teamId: 3, mode: 'NONE' }, conn), { userId: 21, reason: 'auto_team_round_robin' });
    assert.deepEqual(conn.seen[0].params, [1, 3]);
  });
  test('system setting ROUND_ROBIN_TEAM', async () => {
    const conn = fakeConn([[/t\.website_id = \?/, [{ id: 7 }]]]);
    assert.deepEqual(await pickAssignee({ websiteId: 1, mode: 'ROUND_ROBIN_TEAM' }, conn), { userId: 7, reason: 'auto_round_robin' });
  });
  test('no auto assignment configured', async () => {
    assert.deepEqual(await pickAssignee({ websiteId: 1, mode: 'NONE' }, fakeConn([])), { userId: null, reason: null });
  });
});

describe('manual sync helpers', () => {
  test('leads filter uses unix seconds', () => {
    assert.deepEqual(leadsSinceFilter('2026-11-16T00:00:00Z'), [{ field: 'time_created', operator: 'GREATER_THAN', value: 1794787200 }]);
  });
  test('window: 30 days on first sync, else last sync minus overlap', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    assert.equal(syncWindowStart(null, now).toISOString(), '2026-10-17T12:00:00.000Z');
    assert.equal(syncWindowStart('2026-11-16T10:00:00Z', now).toISOString(), '2026-11-16T04:00:00.000Z');
  });
});

describe('conversions, funnel, status', () => {
  test('status -> conversion type', () => {
    assert.equal(conversionTypeFor('QUALIFIED', false), 'QUALIFIED');
    assert.equal(conversionTypeFor('SITE_VISIT', false), 'SITE_VISIT');
    assert.equal(conversionTypeFor('BOOKED', true), 'CONVERTED');
    assert.equal(conversionTypeFor('CONTACTED', false), null);
  });
  test('conversion event: lead id + hashed identifiers, never raw PII', () => {
    const e = buildConversionEvent({ id: 7, source_lead_id: '1234567890123456', email: ' Rahul@Gmail.com ', phone: '98765 43211' },
      { conversion_type: 'SITE_VISIT', conversion_date: '2026-11-16T10:00:00Z', conversion_value: null });
    assert.equal(e.event_name, 'Site Visit');
    assert.equal(e.action_source, 'system_generated');
    assert.equal(e.user_data.lead_id, '1234567890123456');
    assert.equal(e.user_data.em[0], crypto.createHash('sha256').update('rahul@gmail.com').digest('hex'));
    assert.equal(e.user_data.ph[0], hashPhone('+91 98765 43211'));
    assert.ok(!JSON.stringify(e).includes('Rahul'));
    assert.equal(buildConversionEvent({ id: 1, source_lead_id: null }, { conversion_type: 'CONVERTED', conversion_date: new Date() }), null);
  });
  test('funnel percentages', () => {
    const f = funnelFromCounts({ leads: 1240, contacted: 720, qualified: 320, siteVisit: 84, negotiation: 40, converted: 21 });
    assert.equal(f[1].pctOfTotal, 58.1);
    assert.equal(f[3].pctOfPrevious, 26.3);
    assert.equal(f[5].count, 21);
    assert.equal(funnelFromCounts({})[2].pctOfTotal, 0);
  });
  test('connection state', () => {
    assert.equal(connectionState(null, { configured: false }), 'NOT_CONFIGURED');
    assert.equal(connectionState(null, { configured: true }), 'NOT_CONNECTED');
    assert.equal(connectionState({ status: 'ACTIVE' }, { configured: true, tokenValid: false }), 'ERROR');
    assert.equal(connectionState({ status: 'PENDING_SETUP' }, { configured: true, tokenValid: true }), 'SETUP_REQUIRED');
    assert.equal(connectionState({ status: 'ACTIVE' }, { configured: true, tokenValid: true }), 'CONNECTED');
  });
  test('integration logs never keep credentials', () => {
    assert.deepEqual(scrubMeta({ pageId: '1', access_token: 'x', nested: { appSecret: 'y', ok: 1 } }), { pageId: '1', nested: { ok: 1 } });
  });
});
