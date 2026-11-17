import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenInput } from '../src/services/leadCaptureService.js';
import { extractAttribution, deriveSourceMedium } from '../src/integrations/canonical.js';

test('lead capture: simple fields + Google Ads tracking', () => {
  const f = flattenInput({ api_key: 'lc_x', name: 'Dora', mobile: '92999 99990', email: 'dora@gmail.com', project: 'Terra & Sol',
    utm_source: 'google', utm_medium: 'cpc', utm_campaign: '2233', gclid: 'Cj0KCQ' });
  assert.equal(f.name, 'Dora');
  assert.equal(f.phone, '92999 99990');
  assert.equal(f.project, 'Terra & Sol');
  const a = extractAttribution(f);
  assert.equal(a.gclid, 'Cj0KCQ');
  assert.deepEqual([deriveSourceMedium(a).source, deriveSourceMedium(a).medium], ['google', 'cpc']);
  assert.equal(deriveSourceMedium(extractAttribution({ gclid: 'x' })).medium, 'cpc', 'gclid alone = Google Ads');
});

test('lead capture: Sell.do-style nested fields', () => {
  const f = flattenInput({ api_key: 'lc_x', sell_do: { form: { lead: { name: 'dora', email: 'dora@gmail.com', phone: '9299999990' }, note: { content: 'test' } }, campaign: { srd: 'ABC' } } });
  assert.equal(f.name, 'dora');
  assert.equal(f.phone, '9299999990');
  assert.equal(f.email, 'dora@gmail.com');
  assert.equal(f.message, 'test');
  assert.equal(f.campaignCode, 'ABC');
});

test('lead capture: body overrides query, first/last name, honeypot', () => {
  const f = flattenInput({ name: 'q' }, { first_name: 'Asha', last_name: 'Rao', _hp: 'bot' });
  assert.equal(f.name, 'q');
  assert.equal(flattenInput({}, { first_name: 'Asha', last_name: 'Rao' }).name, 'Asha Rao');
  assert.equal(f.honeypot, 'bot');
});
