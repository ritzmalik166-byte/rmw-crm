import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenLeadPayload, isTestLead, autoMap, sanitizeFieldMap, applyMapping, buildCanonical } from '../src/services/metaFormService.js';

// The M3M sheet: Form Name IC_m3mcrown_leadgen_13oct25_, Form id 801811845786683, project M3M Crown Leadgen.
const sheetMap = {
  first_name: 'field:first_name', last_name: 'field:last_name', phone: 'field:phone_number', email: 'field:email',
  enquiry_source: 'const:Digital', enquiry_sub_source: 'const:Facebook', project: 'const:M3M Crown Leadgen',
  utm_source: 'const:facebook', utm_campaign: 'field:adset_name', utm_medium: 'const:paid_social', utm_content: 'field:ad_name',
};
const reg = { id: 7, client_name: 'M3M', form_id: '801811845786683', form_name: 'IC_m3mcrown_leadgen_13oct25_', project_name: 'M3M Crown Leadgen', campaign_type: 'Facebook Campaign', field_map: sheetMap };

test('meta form: Graph-style payload (field_data) flattens, answers win', () => {
  const f = flattenLeadPayload({
    id: '1234567890123', created_time: '2026-11-17T10:00:00+0000', form_id: '801811845786683', ad_name: 'Crown Video', adset_name: 'Gurgaon 30-55',
    field_data: [{ name: 'first_name', values: ['Asha'] }, { name: 'last_name', values: ['Rao'] }, { name: 'phone_number', values: ['+919876543210'] },
      { name: 'email', values: ['ASHA@Example.com'] }, { name: 'which_configuration_are_you_looking_for?', values: ['3 BHK'] }],
    api_key: 'mf_secret',
  });
  assert.equal(f.first_name, 'Asha');
  assert.equal(f.adset_name, 'Gurgaon 30-55');
  assert.equal(f['which_configuration_are_you_looking_for?'], '3 BHK');
  assert.equal(f.api_key, undefined, 'secrets are never stored');
});

test('meta form: flat middleware labels and nested objects normalise', () => {
  const f = flattenLeadPayload({ 'Full Name': 'Asha Rao', 'Phone Number': '98765 43210', Ad: { Name: 'Crown Video' }, leadgen_id: '555555555' });
  assert.equal(f.full_name, 'Asha Rao');
  assert.equal(f.phone_number, '98765 43210');
  assert.equal(f.ad_name, 'Crown Video');
  assert.equal(f.id, '555555555', 'leadgen_id becomes the lead id');
});

test('meta form: CSV export prefixes are stripped', () => {
  const f = flattenLeadPayload({ id: 'l:1234567890', form_id: 'f:801811845786683', ad_id: 'ag:120200000', phone_number: 'p:+919876543210' });
  assert.deepEqual([f.id, f.form_id, f.ad_id, f.phone_number], ['1234567890', '801811845786683', '120200000', '+919876543210']);
});

test('meta form: raw Meta webhook is rejected with a helpful message', () => {
  assert.throws(() => flattenLeadPayload({ object: 'page', entry: [{ changes: [] }] }), /raw Meta webhook/);
});

test('meta form: test leads are detected', () => {
  assert.equal(isTestLead(flattenLeadPayload({ full_name: '<test lead: dummy data for full_name>' })), true);
  assert.equal(isTestLead(flattenLeadPayload({ full_name: 'Asha' })), false);
});

test('meta form: auto-map follows the sheet defaults', () => {
  const m = autoMap(['first_name', 'last_name', 'phone_number', 'email', 'full_name', 'adset_name', 'ad_name', 'campaign_name', 'what_is_your_budget?'], 'M3M Crown Leadgen');
  assert.equal(m.first_name, 'field:first_name');
  assert.equal(m.full_name, undefined, 'first + last preferred over full_name');
  assert.equal(m.phone, 'field:phone_number');
  assert.equal(m.enquiry_source, 'const:Digital');
  assert.equal(m.enquiry_sub_source, 'const:Facebook');
  assert.equal(m.project, 'const:M3M Crown Leadgen');
  assert.equal(m.utm_content, 'field:ad_name');
  assert.equal(m.budget, 'field:what_is_your_budget?');
});

test('meta form: field map sanitising drops unknown targets and junk', () => {
  const m = sanitizeFieldMap({ phone: 'field:Phone Number', hacker: 'field:x', email: 'sql:drop', project: 'const:  M3M  Crown ' });
  assert.deepEqual(m, { phone: 'field:phone_number', project: 'const:M3M Crown' });
});

test('meta form: canonical lead from the sheet mapping', () => {
  const flat = flattenLeadPayload({
    id: '1234567890123', created_time: '2026-11-17T10:00:00+0000', form_id: '801811845786683', platform: 'ig',
    campaign_name: 'M3M Crown Oct', adset_name: 'Gurgaon 30-55', ad_name: 'Crown Video', campaign_id: '120000000001',
    first_name: 'Asha', last_name: 'Rao', phone_number: '+91 98765-43210', email: 'ASHA@Example.com', 'preferred_tower?': 'T2',
  });
  const mapped = applyMapping(sheetMap, flat);
  assert.equal(mapped.utm_campaign, 'Gurgaon 30-55', 'sheet maps UTM_Campaign__c to Adset Name');
  const c = buildCanonical(reg, flat);
  assert.equal(c.name, 'Asha Rao');
  assert.equal(c.phone, '+919876543210');
  assert.equal(c.email, 'asha@example.com');
  assert.equal(c.interest, 'M3M Crown Leadgen');
  assert.equal(c.sourceType, 'META_FORM');
  assert.equal(c.sourceLeadId, '1234567890123');
  assert.equal(c.externalRawId, 'MF-1234567890123');
  assert.equal(c.ad.formId, '801811845786683');
  assert.equal(c.ad.formName, 'M3M', 'client name groups the Client Leads card');
  assert.equal(c.ad.campaignId, '120000000001');
  assert.equal(c.attributionOverride.campaign, 'Gurgaon 30-55');
  assert.equal(c.attribution.extra.platform, 'instagram');
  assert.equal(c.extra.enquirySource, 'Digital');
  assert.equal(c.externalMetadata.sfdc.Enquiry_Sub_Source__c, 'Facebook');
  assert.equal(c.externalMetadata.sfdc.Project__c, 'M3M Crown Leadgen');
  assert.match(c.message, /Preferred tower\?: T2/, 'unmapped answers go into the note');
  assert.equal(c.externalCreatedAt.toISOString(), '2026-11-17T10:00:00.000Z');
});

test('meta form: no lead id -> generated raw id, project falls back to registration', () => {
  const c = buildCanonical({ ...reg, field_map: { phone: 'field:phone_number' } }, flattenLeadPayload({ phone_number: '9876543210' }));
  assert.equal(c.sourceLeadId, null);
  assert.match(c.externalRawId, /^MF7-/);
  assert.equal(c.interest, 'M3M Crown Leadgen');
});
