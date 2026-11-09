/** Normalise Indian/intl phone numbers to digits; strips +91 / leading 0 for 10-digit Indian numbers. */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function normalizeEmail(raw) {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  return e.includes('@') ? e : null;
}

export function maskMobile(m) {
  const d = normalizePhone(m) || '';
  return d.length >= 4 ? `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}` : '****';
}

export const clean = (v, max = 255) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

export function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
