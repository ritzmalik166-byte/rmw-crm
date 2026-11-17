import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoogleAdsLead, parseColumns } from '../src/integrations/googleAds/googleAdsLead.js';
import { googleAdsState } from '../src/integrations/googleAds/googleAds.service.js';

const sample = {
  lead_id: 'TeSter-123-ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcdefghijklmnopqrstuvwxyz-0123456789-AaBbCcDdEe',
  api_version: '1.0',
  form_id: 40000000000,
  campaign_id: 20000000000,
  adgroup_id: 30000000000,
  creative_id: 50000000000,
  gcl_id: 'EAIaIQobChMI',
  google_key: 'secret',
  is_test: false,
  user_column_data: [
    { column_name: 'Full Name', string_value: 'Rahul  Sharma', column_id: 'FULL_NAME' },
    { column_name: 'User Phone', string_value: '+91 98765 43210', column_id: 'PHONE_NUMBER' },
    { column_name: 'User Email', string_value: 'Rahul@Example.in', column_id: 'EMAIL' },
    { column_name: 'City', string_value: 'Noida', column_id: 'CITY' },
    { column_name: 'What is your budget?', string_value: '80L - 1Cr', column_id: 'what_is_your_budget?' },
    { column_name: 'Which BHK are you looking for?', string_value: '3 BHK', column_id: 'which_bhk' },
  ],
};

describe('Google Ads lead mapping', () => {
  test('contact fields, custom answers and attribution', () => {
    const c = normalizeGoogleAdsLead(sample);
    assert.equal(c.sourceType, 'GOOGLE_ADS');
    assert.equal(c.sourceLeadId, sample.lead_id.slice(0, 100));
    assert.equal(c.name, 'Rahul Sharma');
    assert.equal(c.phone, '+91 98765 43210');
    assert.equal(c.email, 'rahul@example.in');
    assert.equal(c.interest, '3 BHK');
    assert.equal(c.externalMetadata.budget, '80L - 1Cr');
    assert.equal(c.location, 'Noida');
    assert.match(c.message, /What is your budget\?: 80L - 1Cr/);
    assert.equal(c.attribution.gclid, 'EAIaIQobChMI');
    assert.deepEqual(c.attributionOverride, { source: 'google', medium: 'cpc', campaign: '20000000000', term: '30000000000', content: '50000000000' });
    assert.equal(c.ad.formId, '40000000000');
    assert.equal(c.forceJunk, null);
    assert.ok(!JSON.stringify(c).includes('secret'), 'google_key must never be copied into the lead');
  });

  test('test deliveries are flagged junk', () => {
    assert.equal(normalizeGoogleAdsLead({ ...sample, is_test: true }).forceJunk, 'test');
  });

  test('first + last name, invalid email dropped', () => {
    const c = normalizeGoogleAdsLead({ lead_id: 'x1', user_column_data: [
      { column_id: 'FIRST_NAME', string_value: 'Asha' }, { column_id: 'LAST_NAME', string_value: 'Rao' }, { column_id: 'EMAIL', string_value: 'nope' }] });
    assert.equal(c.name, 'Asha Rao');
    assert.equal(c.email, null);
  });

  test('rejects payload without lead_id', () => {
    assert.throws(() => normalizeGoogleAdsLead({ user_column_data: [] }));
  });

  test('parseColumns dedupes and strips control chars', () => {
    const cols = parseColumns([{ column_id: 'email', string_value: 'a@b.co\u0007' }, { column_id: 'EMAIL', string_value: 'dup' }]);
    assert.equal(cols.length, 1);
    assert.equal(cols[0].id, 'EMAIL');
    assert.equal(cols[0].value, 'a@b.co');
  });

  test('connection state', () => {
    assert.equal(googleAdsState(null), 'NOT_CONNECTED');
    assert.equal(googleAdsState({ is_active: 1, webhook_key_enc: null, website_id: 1 }), 'SETUP_REQUIRED');
    assert.equal(googleAdsState({ is_active: 1, webhook_key_enc: 'x', website_id: 1 }), 'CONNECTED');
  });
});
