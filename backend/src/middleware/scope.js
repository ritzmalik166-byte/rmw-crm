import { forbidden } from '../utils/errors.js';

/**
 * Website-level access: the list of website ids the caller may see. Always derived from the DB auth context.
 * A requested websiteId outside this list is rejected (not silently widened).
 */
export function websiteScope(req, requestedWebsiteId) {
  const allowed = req.auth.ctx.websiteIds;
  if (requestedWebsiteId) {
    const id = Number(requestedWebsiteId);
    if (!allowed.includes(id)) throw forbidden('You do not have access to this website', 'WEBSITE_FORBIDDEN');
    return [id];
  }
  return allowed;
}

const isCareer = (a) => `(LOWER(COALESCE(${a}.form_type, '')) = 'career' OR COALESCE(${a}.junk_reason, '') = 'career')`;

export function leadVisibilitySql(req, alias = 'l') {
  const { ctx, user } = req.auth;
  const ids = ctx.websiteIds;
  if (!ids.length) return { sql: '1=0', params: [] };
  const parts = [`${alias}.website_id IN (?)`];
  const params = [ids];
  if (!ctx.permissions.has('lead.view_all')) {
    parts.push(`${alias}.assigned_user_id = ?`);
    params.push(user.id);
  }
  if (!ctx.permissions.has('career.view')) parts.push(`NOT ${isCareer(alias)}`);
  return { sql: parts.join(' AND '), params };
}
