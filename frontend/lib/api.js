export class ApiError extends Error {
  constructor(message, { status, errorCode, details } = {}) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

/**
 * Real OS version from UA Client Hints. Browsers freeze the User-Agent at "Windows NT 10.0" even on Windows 11,
 * so the server needs platformVersion (13+ means Windows 11) to label devices correctly. Resolved once, then cached.
 */
let platformVersionPromise;
function platformVersion() {
  if (typeof navigator === 'undefined' || !navigator.userAgentData?.getHighEntropyValues) return Promise.resolve(null);
  platformVersionPromise ??= navigator.userAgentData.getHighEntropyValues(['platformVersion'])
    .then((v) => v.platformVersion || null)
    .catch(() => null);
  return platformVersionPromise;
}

/** Fetch wrapper for the CRM API. Same-origin (/api is proxied to Express), cookies included, JSON in and out. */
export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  let res;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const pv = await platformVersion();
  if (pv) headers['X-Client-Platform-Version'] = pv;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', { status: 0, errorCode: 'NETWORK' });
  }
  if (raw && res.ok) return res;
  const json = await res.json().catch(() => null);
  const outage = res.status === 502 || res.status === 504 || (res.status === 503 && (!json || json.errorCode === 'MAINTENANCE'));
  if (outage && typeof window !== 'undefined') {
    window.__appMaintenance = { message: json?.message };
    window.dispatchEvent(new CustomEvent('app:maintenance', { detail: { message: json?.message } }));
  }
  if (!res.ok || json?.success === false) {
    const err = new ApiError(json?.message || `Request failed (${res.status})`, { status: res.status, errorCode: json?.errorCode, details: json?.details });
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.dispatchEvent(new CustomEvent('crm:unauthorized'));
    }
    throw err;
  }
  return json?.data ?? null;
}

export const apiMessage = (err) => err?.message || 'Something went wrong';
