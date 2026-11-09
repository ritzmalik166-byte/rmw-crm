export class ApiError extends Error {
  constructor(message, { status, errorCode, details } = {}) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

/** Fetch wrapper for the CRM API. Same-origin (/api is proxied to Express), cookies included, JSON in and out. */
export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
