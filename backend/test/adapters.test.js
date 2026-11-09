import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_HOST ||= 'x'; process.env.DB_NAME ||= 'x'; process.env.DB_USER ||= 'x'; process.env.DB_PASSWORD ||= 'x';
process.env.APP_ENCRYPTION_KEY ||= 'test-encryption-key-at-least-32-characters';
process.env.OTP_SECRET ||= 'test-otp-secret-at-least-32-characters-long';

const { getAdapter } = await import('../src/integrations/index.js');
const { deriveSourceMedium } = await import('../src/integrations/canonical.js');
const { normalizePhone } = await import('../src/utils/normalize.js');

test('MPF: payload from CrmIntegrationService keeps external id, UTM and journey data', () => {
  const lead = getAdapter('MPF').normalize({
    externalId: 10293, name: 'Asha', email: 'a@x.com', phone: '+91 98100 00000', message: 'Need 3BHK',
    enquiryFrom: 'WEBSITE', pageName: 'Project Detail', projectLink: 'https://mypropertyfact.in/p/x', createdAt: '2026-11-09T10:15:00',
    metadata: {
      utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'noida_property', utm_term: '3bhk noida', gclid: 'abc',
        referrer: 'https://www.google.com/', landing_page: 'mypropertyfact.in/noida', exit_page: 'mypropertyfact.in/p/x' },
      property: { project: 'Godrej Woods', city: 'Noida', locality: 'Sector 43' },
      geo: { country: 'India', state: 'UP' },
    },
  });
  assert.equal(lead.externalRawId, '10293');
  assert.equal(lead.attribution.utm_source, 'google');
  assert.equal(lead.attribution.utm_campaign, 'noida_property');
  assert.equal(lead.attribution.utm_term, '3bhk noida');
  assert.equal(lead.attribution.gclid, 'abc');
  assert.equal(lead.attribution.landing_page, 'mypropertyfact.in/noida');
  assert.equal(lead.attribution.page_name, 'Project Detail');
  assert.equal(lead.attribution.extra.exit_page, 'mypropertyfact.in/p/x');
  assert.equal(lead.interest, 'Godrej Woods');
  assert.equal(lead.externalCreatedAt.toISOString(), '2026-11-09T04:45:00.000Z'); // no zone = IST
});

test('MPF: stringified metadataJson is parsed', () => {
  const lead = getAdapter('MPF').normalize({ externalId: 5, metadataJson: JSON.stringify({ utm: { utm_source: 'facebook' } }) });
  assert.equal(lead.attribution.utm_source, 'facebook');
});

test('RMW: parses labelled message fields and etype', () => {
  const lead = getAdapter('RMW').normalize({
    id: 88321, etype: 'ContactUs', name: 'Ravi K', email: 'r@x.com', phone: '9876543210',
    message: 'Reason for Inquiry: Digital Marketing\nCountry: India\nHow did you hear about us: LinkedIn\n\nMessage: hello',
  });
  assert.equal(lead.externalRawId, '88321');
  assert.equal(lead.formType, 'ContactUs');
  assert.equal(lead.interest, 'Digital Marketing');
  assert.equal(lead.location, 'India');
  assert.equal(lead.attribution.extra.self_reported_source, 'LinkedIn');
});

test('RMW: UTM fields are accepted once the site starts sending them', () => {
  const lead = getAdapter('RMW').normalize({ id: 1, name: 'x', utm: { utm_source: 'newsletter', utm_medium: 'email' } });
  assert.equal(lead.attribution.utm_source, 'newsletter');
});

test('CT: popup source URL becomes landing page', () => {
  const lead = getAdapter('CT').normalize({
    id: 44012, type: 'contact', full_name: 'Meera', email: 'm@x.com', phone: '9000000000', service: '3D Websites',
    message: 'Hi\n\nCountry: UAE', source: 'https://contenaissance.com/services/3d#lead-popup',
  });
  assert.equal(lead.externalRawId, '44012');
  assert.equal(lead.attribution.landing_page, 'https://contenaissance.com/services/3d');
  assert.equal(lead.attribution.page_name, 'Lead popup');
  assert.equal(lead.formType, 'contact-popup');
  assert.equal(lead.location, 'UAE');
});

test('Adapters reject payloads without a source id', () => {
  for (const code of ['MPF', 'RMW', 'CT']) assert.throws(() => getAdapter(code).normalize({ name: 'x' }), /missing the source lead id/);
});

test('Source derivation: explicit UTM wins, then click ids, then referrer', () => {
  assert.deepEqual(deriveSourceMedium({ utm_source: 'google', utm_medium: 'cpc' }).source, 'google');
  assert.equal(deriveSourceMedium({ gclid: 'x' }).medium, 'cpc');
  assert.equal(deriveSourceMedium({ referrer: 'https://www.bing.com/search' }).medium, 'organic');
  assert.equal(deriveSourceMedium({ referrer: 'https://www.linkedin.com/' }).source, 'linkedin');
  assert.equal(deriveSourceMedium({ referrer: 'https://mypropertyfact.in/x' }, 'mypropertyfact.in').source, 'direct');
  assert.equal(deriveSourceMedium({}).source, 'direct');
});

test('Phone normalisation', () => {
  assert.equal(normalizePhone('+91 98100-00000'), '9810000000');
  assert.equal(normalizePhone('09810000000'), '9810000000');
});
