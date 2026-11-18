'use client';
import { useSyncExternalStore } from 'react';

/**
 * Personal display preferences (per browser): accent colour, density, text size, corner style, sticky summary bar.
 * Applied as CSS variables / data attributes on <html>, so every page picks them up without prop drilling.
 * A tiny inline script in app/layout.jsx applies them before first paint (no colour flash).
 */
export const PREFS_KEY = 'crm:prefs';

export const ACCENTS = {
  navy: { label: 'Navy', primary: '213 62% 26%', ring: '213 62% 36%', accent: '213 45% 95%', accentFg: '213 62% 22%' },
  blue: { label: 'Blue', primary: '221 83% 45%', ring: '221 83% 53%', accent: '221 90% 96%', accentFg: '221 83% 35%' },
  teal: { label: 'Teal', primary: '175 84% 26%', ring: '175 84% 32%', accent: '170 60% 94%', accentFg: '175 84% 22%' },
  indigo: { label: 'Indigo', primary: '243 60% 45%', ring: '243 60% 55%', accent: '243 80% 96%', accentFg: '243 60% 35%' },
  emerald: { label: 'Emerald', primary: '160 84% 28%', ring: '160 84% 35%', accent: '150 60% 94%', accentFg: '160 84% 22%' },
  plum: { label: 'Plum', primary: '292 45% 35%', ring: '292 45% 45%', accent: '292 50% 96%', accentFg: '292 45% 28%' },
  slate: { label: 'Graphite', primary: '215 25% 27%', ring: '215 20% 40%', accent: '214 32% 95%', accentFg: '215 25% 22%' },
};

export const DEFAULT_PREFS = { accent: 'navy', density: 'comfortable', textSize: 'm', corners: 'rounded', stickySummary: true };
const ZOOM = { s: 0.92, m: 1, l: 1.08 };
const RADIUS = { square: '0.25rem', rounded: '0.625rem', soft: '0.9rem' };

let cache = null;
const listeners = new Set();

export function readPrefs() {
  if (cache) return cache;
  try { cache = { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}) }; } catch { cache = { ...DEFAULT_PREFS }; }
  return cache;
}

export function applyPrefs(p = readPrefs()) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const a = ACCENTS[p.accent] || ACCENTS.navy;
  root.style.setProperty('--primary', a.primary);
  root.style.setProperty('--ring', a.ring);
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--accent-foreground', a.accentFg);
  root.style.setProperty('--radius', RADIUS[p.corners] || RADIUS.rounded);
  root.style.zoom = String(ZOOM[p.textSize] || 1);
  root.dataset.density = p.density === 'compact' ? 'compact' : 'comfortable';
  root.dataset.stickySummary = p.stickySummary === false ? 'off' : 'on';
}

export function setPrefs(patch) {
  cache = { ...readPrefs(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(cache)); } catch { /* storage blocked */ }
  applyPrefs(cache);
  listeners.forEach((l) => l());
}

export function resetPrefs() {
  try { localStorage.removeItem(PREFS_KEY); } catch { /* ignore */ }
  cache = { ...DEFAULT_PREFS };
  applyPrefs(cache);
  listeners.forEach((l) => l());
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
export function usePrefs() {
  return useSyncExternalStore(subscribe, readPrefs, () => DEFAULT_PREFS);
}

/** Inline script for <head>: applies saved prefs before React loads. Keep in sync with applyPrefs(). */
export const PREFS_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREFS_KEY}')||'{}')||{};var A=${JSON.stringify(
  Object.fromEntries(Object.entries(ACCENTS).map(([k, v]) => [k, [v.primary, v.ring, v.accent, v.accentFg]])),
)};var a=A[p.accent]||A.navy,r=document.documentElement,s=r.style;s.setProperty('--primary',a[0]);s.setProperty('--ring',a[1]);s.setProperty('--accent',a[2]);s.setProperty('--accent-foreground',a[3]);s.setProperty('--radius',({square:'0.25rem',soft:'0.9rem'})[p.corners]||'0.625rem');s.zoom=({s:0.92,l:1.08})[p.textSize]||1;r.dataset.density=p.density==='compact'?'compact':'comfortable';r.dataset.stickySummary=p.stickySummary===false?'off':'on';}catch(e){}})();`;
