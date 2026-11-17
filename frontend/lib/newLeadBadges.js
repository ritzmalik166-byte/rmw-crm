'use client';
import { useSyncExternalStore } from 'react';

/**
 * "New" tags in the sidebar. A live NEW_LEAD event marks the matching section; opening that section clears it.
 * Keys: website pipelines ('mpf', 'rmw', 'ct'), 'career', and one per lead connector ('meta', ...).
 * A new connector only needs a key in channelKeyFor() and `badgeKey` on its sidebar item.
 * Kept per browser in localStorage so a tag survives a refresh until the section is opened.
 */
const STORAGE_KEY = 'crm:newLeadBadges';
const listeners = new Set();
let state = null;

function load() {
  if (state) return state;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { state = {}; }
  return state;
}
function save(next) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  listeners.forEach((l) => l());
}

/** Lead source type -> sidebar key for leads that belong to a connector, not a website pipeline. */
const CONNECTOR_KEYS = { META: 'meta', LANDING_PAGE: 'client' };

/** Which sidebar section a NEW_LEAD event belongs to. */
export function badgeKeyFor(lead) {
  if (!lead) return null;
  if (lead.kind === 'career application') return 'career';
  if (CONNECTOR_KEYS[lead.sourceType]) return CONNECTOR_KEYS[lead.sourceType];
  return lead.website ? String(lead.website).toLowerCase() : null;
}

export function markNew(key) {
  if (!key) return;
  const s = load();
  if (s[key]) return;
  save({ ...s, [key]: Date.now() });
}

export function clearNew(key) {
  const s = load();
  if (!s[key]) return;
  const { [key]: _drop, ...rest } = s;
  save(rest);
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const EMPTY = {};

/** { [key]: markedAt } of sections with unseen new leads. */
export function useNewBadges() {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}
