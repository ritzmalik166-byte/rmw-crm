/** Wrap async route handlers so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res, data = null, message, status = 200) => res.status(status).json({ success: true, ...(message ? { message } : {}), data });

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || null;
}

export function parsePagination(q, { maxLimit = 100, defaultLimit = 25 } = {}) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(q.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

export const pageMeta = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
