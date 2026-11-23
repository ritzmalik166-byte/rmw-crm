/**
 * Live user presence for the Owner's "Live users" page.
 *
 * Kept in memory in the API process (the only process that holds sockets; PM2 runs one crm-api instance).
 * After a restart every open tab reconnects within seconds and reports its page again, so nothing needs persisting.
 *
 *  socket entry: { userId, sessionId, platform, page, title, visible, connectedAt, lastSeenAt, ip, userAgent }
 *  last action : per user, the latest successful write request in plain words ("Added a note on lead #42")
 */

/** A tab that has not sent a heartbeat for this long counts as idle even if still connected. */
export const IDLE_AFTER_MS = 2 * 60_000;

const sockets = new Map(); // socketId -> entry
const lastActions = new Map(); // userId -> { label, at }

let notify = () => {};
/** Called by socket.js so presence changes reach the Owner room. */
export function setPresenceNotifier(fn) { notify = fn; }

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

export function socketConnected(socketId, { userId, sessionId, ip, userAgent }) {
  const now = Date.now();
  sockets.set(socketId, {
    userId, sessionId, platform: 'web', page: null, title: null, visible: true, connectedAt: now, lastSeenAt: now,
    ip: clip(ip, 64), userAgent: clip(userAgent, 300),
  });
  notify(userId);
}

/** Client heartbeat / route change: { page, title, visible, platform }. Notifies only when something visible changed. */
export function socketUpdate(socketId, payload = {}) {
  const s = sockets.get(socketId);
  if (!s) return;
  const next = {
    page: clip(payload.page, 300) ?? s.page,
    title: clip(payload.title, 150) ?? s.title,
    visible: typeof payload.visible === 'boolean' ? payload.visible : s.visible,
    platform: payload.platform === 'app' ? 'app' : 'web',
  };
  const changed = next.page !== s.page || next.visible !== s.visible || next.title !== s.title
    || Date.now() - s.lastSeenAt > IDLE_AFTER_MS; // coming back from idle
  Object.assign(s, next, { lastSeenAt: Date.now() });
  if (changed) notify(s.userId);
}

export function socketDisconnected(socketId) {
  const s = sockets.get(socketId);
  if (!s) return;
  sockets.delete(socketId);
  notify(s.userId);
}

const ACTION_RULES = [
  [/^POST \/api\/crm\/leads\/(\d+)\/notes$/, (m) => `Added a note on lead #${m[1]}`],
  [/^POST \/api\/crm\/leads\/(\d+)\/followups$/, (m) => `Scheduled a follow-up on lead #${m[1]}`],
  [/^POST \/api\/crm\/leads\/(\d+)\/assign$/, (m) => `Assigned lead #${m[1]}`],
  [/^POST \/api\/crm\/leads\/(\d+)\/acknowledge$/, (m) => `Acknowledged lead #${m[1]}`],
  [/^PATCH \/api\/crm\/leads\/(\d+)$/, (m) => `Updated lead #${m[1]}`],
  [/^DELETE \/api\/crm\/leads\/(\d+)$/, (m) => `Deleted lead #${m[1]}`],
  [/^POST \/api\/crm\/leads\/bulk$/, () => 'Bulk-updated leads'],
  [/^POST \/api\/crm\/leads$/, () => 'Created a lead'],
  [/^PATCH \/api\/crm\/followups\/(\d+)$/, () => 'Updated a follow-up'],
  [/^POST \/api\/crm\/duplicates\/(\d+)\/resolve$/, () => 'Resolved a duplicate lead'],
  [/^GET \/api\/crm\/leads\/export/, () => 'Exported leads'],
  [/^(POST|PATCH|PUT|DELETE) \/api\/(admin|super-admin)\/users/, () => 'Managed users'],
  [/^(POST|PATCH|PUT|DELETE) \/api\/(admin|super-admin)\/(teams|departments)/, () => 'Managed teams / departments'],
  [/^(POST|PATCH|PUT|DELETE) \/api\/(admin|super-admin)\/settings/, () => 'Changed system settings'],
  [/^(POST|PATCH|PUT|DELETE) \/api\/(admin|super-admin)\//, () => 'Changed admin configuration'],
];

/** Express hook: remembers the user's latest successful action. Read requests are ignored except exports. */
export function recordAction(userId, method, path) {
  const key = `${method} ${path.split('?')[0]}`;
  for (const [re, label] of ACTION_RULES) {
    const m = key.match(re);
    if (m) {
      lastActions.set(userId, { label: label(m), at: Date.now() });
      notify(userId);
      return;
    }
  }
}

/** Per-user live summary: { status, platform, page, title, connections, onlineSince, lastSeenAt, ip, userAgent, lastAction }. */
export function presenceSnapshot() {
  const byUser = new Map();
  const now = Date.now();
  for (const s of sockets.values()) {
    const list = byUser.get(s.userId) || [];
    list.push(s);
    byUser.set(s.userId, list);
  }
  const out = new Map();
  for (const [userId, list] of byUser) {
    const active = list.filter((s) => s.visible && now - s.lastSeenAt < IDLE_AFTER_MS);
    const best = (active.length ? active : list).reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a));
    out.set(userId, {
      status: active.length ? 'online' : 'idle',
      platform: best.platform,
      page: best.page,
      title: best.title,
      connections: list.length,
      onlineSince: Math.min(...list.map((s) => s.connectedAt)),
      lastSeenAt: Math.max(...list.map((s) => s.lastSeenAt)),
      ip: best.ip,
      userAgent: best.userAgent,
    });
  }
  for (const [userId, a] of lastActions) {
    out.set(userId, { ...(out.get(userId) || { status: 'offline' }), lastAction: a });
  }
  return out;
}
