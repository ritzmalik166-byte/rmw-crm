/** Business timezone offset (IST, UTC+05:30). Dashboards default to "today" in this timezone. */
const IST_OFFSET_MS = 330 * 60_000;

/** Start of the current IST day, as a UTC Date. */
export function startOfTodayIst(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/**
 * Dashboard date range from `?from=&to=` (ISO strings). Without them it is today (IST).
 * Invalid or reversed values fall back to today so a bad link never breaks the dashboard.
 */
export function dashboardRange(q = {}) {
  const from = parseBound(q.from);
  const to = parseBound(q.to, true);
  if (from && to && from <= to) return { from, to, isToday: false };
  const start = startOfTodayIst();
  return { from: start, to: new Date(start.getTime() + 86_400_000 - 1), isToday: true };
}

/**
 * Parse a filter bound. A bare date (YYYY-MM-DD) means the whole IST day: `from` = 00:00, `to` = 23:59:59.999.
 * Full ISO timestamps are used as-is.
 */
export function parseBound(v, end = false) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const start = new Date(new Date(`${v}T00:00:00.000Z`).getTime() - IST_OFFSET_MS);
    return end ? new Date(start.getTime() + 86_400_000 - 1) : start;
  }
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}
