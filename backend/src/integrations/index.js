import * as mpf from './mpf/adapter.js';
import * as rmw from './rmw/adapter.js';
import * as ct from './ct/adapter.js';

const ADAPTERS = { MPF: mpf, RMW: rmw, CT: ct };

export function getAdapter(websiteCode) {
  return ADAPTERS[String(websiteCode).toUpperCase()] || null;
}
