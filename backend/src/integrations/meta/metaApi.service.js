/**
 * Thin Graph API client. Every call: version-pinned URL, timeout, appsecret_proof, and Meta errors mapped to
 * MetaApiError with a stable errorCode. Access tokens are never logged or put in error messages.
 */
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const GRAPH_HOST = 'https://graph.facebook.com';
const TIMEOUT_MS = 20_000;

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);
const TRANSIENT_CODES = new Set([1, 2]);

/** Map a Graph error (code / subcode / type) to a CRM error code. */
export function classifyMetaError(code, subcode, type) {
  if (code === 190 || code === 102 || code === 463 || code === 467) return 'META_TOKEN_INVALID';
  if (code === 10 || (code >= 200 && code <= 299)) return 'META_PERMISSION_DENIED';
  if (RATE_LIMIT_CODES.has(code)) return 'META_RATE_LIMITED';
  if (TRANSIENT_CODES.has(code)) return 'META_UNAVAILABLE';
  if (code === 803) return 'META_NOT_FOUND';
  if (code === 100) return 'META_INVALID_REQUEST';
  if (type === 'OAuthException') return 'META_TOKEN_INVALID';
  return 'META_API_ERROR';
}

/* HTTP status the CRM API returns for each code. 401 is avoided on purpose: the web app treats 401 as "signed out". */
const STATUS = {
  META_TOKEN_INVALID: 409, META_PERMISSION_DENIED: 403, META_RATE_LIMITED: 429, META_UNAVAILABLE: 503,
  META_NOT_FOUND: 404, META_INVALID_REQUEST: 400, META_API_ERROR: 502, META_TIMEOUT: 504, META_NETWORK: 503,
};

const FRIENDLY = {
  META_TOKEN_INVALID: 'The Meta connection has expired or was revoked. Reconnect Meta.',
  META_PERMISSION_DENIED: 'Meta denied access. The connected account is missing a required permission or Page role.',
  META_RATE_LIMITED: 'Meta rate limit reached. Try again in a few minutes.',
  META_UNAVAILABLE: 'Meta is temporarily unavailable. Try again shortly.',
  META_TIMEOUT: 'Meta did not respond in time. Try again shortly.',
  META_NETWORK: 'Could not reach Meta. Check the server network connection.',
};

export class MetaApiError extends Error {
  constructor(message, { errorCode = 'META_API_ERROR', metaCode = null, metaSubcode = null, fbtraceId = null } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.errorCode = errorCode;
    this.status = STATUS[errorCode] || 502;
    this.metaCode = metaCode;
    this.metaSubcode = metaSubcode;
    this.fbtraceId = fbtraceId;
    this.expose = true; // the CRM error handler returns message + errorCode
  }

  get isTokenError() { return this.errorCode === 'META_TOKEN_INVALID'; }
  get isPermissionError() { return this.errorCode === 'META_PERMISSION_DENIED'; }
  get isRateLimit() { return this.errorCode === 'META_RATE_LIMITED'; }
  /** Worth retrying later (queue backoff). */
  get isTransient() { return ['META_UNAVAILABLE', 'META_RATE_LIMITED', 'META_TIMEOUT', 'META_NETWORK'].includes(this.errorCode); }
}

export function fromGraphError(body, httpStatus) {
  const e = body?.error || {};
  const errorCode = classifyMetaError(Number(e.code), Number(e.error_subcode), e.type);
  const detail = String(e.error_user_msg || e.message || `Meta API error (HTTP ${httpStatus})`).replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]');
  const message = FRIENDLY[errorCode] && errorCode !== 'META_PERMISSION_DENIED' ? FRIENDLY[errorCode] : `${FRIENDLY[errorCode] ? `${FRIENDLY[errorCode]} ` : ''}${detail}`.trim();
  return new MetaApiError(message.slice(0, 500), { errorCode, metaCode: e.code ?? null, metaSubcode: e.error_subcode ?? null, fbtraceId: e.fbtrace_id ?? null });
}

/** HMAC of the token with the app secret; Meta rejects calls without it when "Require App Secret" is enabled. */
export function appSecretProof(token) {
  return crypto.createHmac('sha256', env.META_APP_SECRET || '').update(String(token)).digest('hex');
}

export function graphUrl(path, params = {}) {
  const url = /^https:\/\//.test(path) ? new URL(path) : new URL(`${GRAPH_HOST}/${env.META_API_VERSION}/${String(path).replace(/^\//, '')}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return url;
}

async function send(url, method) {
  let res;
  try {
    res = await globalThis.fetch(url, { method, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new MetaApiError(FRIENDLY.META_TIMEOUT, { errorCode: 'META_TIMEOUT' });
    throw new MetaApiError(FRIENDLY.META_NETWORK, { errorCode: 'META_NETWORK' });
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : {}; } catch { body = null; }
  if (!res.ok || body?.error) {
    if (body?.error) throw fromGraphError(body, res.status);
    throw new MetaApiError(res.status >= 500 ? FRIENDLY.META_UNAVAILABLE : `Meta API error (HTTP ${res.status})`, { errorCode: res.status >= 500 ? 'META_UNAVAILABLE' : 'META_API_ERROR' });
  }
  if (body === null) throw new MetaApiError('Meta returned an invalid response', { errorCode: 'META_API_ERROR' });
  return body;
}

/**
 * Call the Graph API. `token` is added as access_token with appsecret_proof.
 * Returns the parsed JSON body.
 */
export async function graph(path, { token, method = 'GET', params = {} } = {}) {
  const qp = { ...params };
  if (token) { qp.access_token = token; qp.appsecret_proof = appSecretProof(token); }
  return send(graphUrl(path, qp), method);
}

/** Follow `paging.next` cursors and return all `data` rows (bounded by maxPages). */
export async function graphPaged(path, { token, params = {}, maxPages = 20 } = {}) {
  const rows = [];
  let body = await graph(path, { token, params });
  for (let page = 1; ; page += 1) {
    if (Array.isArray(body?.data)) rows.push(...body.data);
    const next = body?.paging?.next;
    if (!next || page >= maxPages) break;
    // `next` already carries access_token; re-sign it so appsecret_proof is always present.
    const url = new URL(next);
    if (token) { url.searchParams.set('access_token', token); url.searchParams.set('appsecret_proof', appSecretProof(token)); }
    body = await send(url, 'GET');
  }
  return rows;
}

/** App access token ("app_id|app_secret"), used only server-side for debug_token. */
export const appAccessToken = () => `${env.META_APP_ID}|${env.META_APP_SECRET}`;
