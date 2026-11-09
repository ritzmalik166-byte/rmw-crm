import { query, one, transaction } from '../config/db.js';
import { leadVisibilitySql, websiteScope } from '../middleware/scope.js';
import { audit } from './auditService.js';
import { notificationService } from '../notifications/notificationService.js';
import { emitToUser, emitToWebsite, EVENTS } from '../realtime/socket.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';
import { normalizePhone, normalizeEmail } from '../utils/normalize.js';
import { randomToken } from '../utils/crypto.js';

// "Received" = when the enquiry was submitted on the website (falls back to CRM import time).
const RECEIVED = 'COALESCE(l.external_created_at, l.created_at)';
const SORTS = { created_at: RECEIVED, received_at: RECEIVED, updated_at: 'l.updated_at', name: 'l.name', status: 's.sort_order', website: 'w.code' };

const LIST_SELECT = `l.id, l.external_lead_id, l.name, l.phone, l.email, l.location, l.interest, l.form_type, l.created_at, l.updated_at,
  l.external_created_at, COALESCE(l.external_created_at, l.created_at) AS received_at, l.is_duplicate_suspect, l.junk_reason, l.assigned_user_id, w.id AS website_id, w.code AS website_code,
  s.id AS status_id, s.code AS status_code, s.name AS status_name, s.color AS status_color,
  u.full_name AS assigned_user_name, a.source, a.medium, a.campaign, a.utm_source, a.utm_campaign,
  (SELECT MIN(f.due_at) FROM lead_followups f WHERE f.lead_id = l.id AND f.status IN ('UPCOMING','OVERDUE')) AS next_followup_at`;

const LIST_FROM = `FROM leads l JOIN websites w ON w.id = l.website_id JOIN lead_statuses s ON s.id = l.status_id
  LEFT JOIN users u ON u.id = l.assigned_user_id LEFT JOIN lead_attributions a ON a.lead_id = l.id`;

// COALESCE on both columns: a NULL here would make NOT(...) NULL and silently drop every general lead.
const IS_CAREER = "(LOWER(COALESCE(l.form_type, '')) = 'career' OR COALESCE(l.junk_reason, '') = 'career')";
const siteIs = (code) => `l.website_id = (SELECT id FROM websites WHERE code = '${code}')`;
// Separate pipelines. Career applications arrive via RMW (etype=career) but are tracked on their own.
export const PIPELINES = {
  mpf: { sql: siteIs('MPF'), params: [] },
  ct: { sql: siteIs('CT'), params: [] },
  rmw: { sql: `${siteIs('RMW')} AND NOT ${IS_CAREER}`, params: [] },
  career: { sql: IS_CAREER, params: [] },
  general: { sql: `NOT ${IS_CAREER}`, params: [] },
};

function buildFilters(req, f) {
  const vis = leadVisibilitySql(req);
  const where = [vis.sql, 'l.merged_into_lead_id IS NULL'];
  const params = [...vis.params];
  if (f.websiteId) { websiteScope(req, f.websiteId); where.push('l.website_id = ?'); params.push(f.websiteId); }
  if (f.statusId) { where.push('l.status_id = ?'); params.push(f.statusId); }
  if (f.source) { where.push('a.source = ?'); params.push(f.source); }
  if (f.campaign) { where.push('(a.campaign = ? OR a.utm_campaign = ?)'); params.push(f.campaign, f.campaign); }
  if (f.assignedUserId === 'unassigned') where.push('l.assigned_user_id IS NULL');
  else if (f.assignedUserId === 'me') { where.push('l.assigned_user_id = ?'); params.push(req.auth.user.id); }
  else if (f.assignedUserId) { where.push('l.assigned_user_id = ?'); params.push(Number(f.assignedUserId)); }
  const pipe = PIPELINES[f.pipeline];
  if (pipe) { where.push(pipe.sql); params.push(...pipe.params); }
  if (f.formType) { where.push('l.form_type = ?'); params.push(f.formType); }
  if (f.interest) { where.push('l.interest LIKE ?'); params.push(`%${f.interest}%`); }
  // In the Career pipeline, "career" is the lead type, not junk.
  const junkCol = f.pipeline === 'career' ? "NULLIF(l.junk_reason, 'career')" : 'l.junk_reason';
  if (f.junk === 'only') where.push(`${junkCol} IS NOT NULL`);
  else if (f.junk !== 'all') where.push(`${junkCol} IS NULL`);
  if (f.from) { where.push(`${RECEIVED} >= ?`); params.push(new Date(f.from)); }
  if (f.to) { where.push(`${RECEIVED} <= ?`); params.push(new Date(f.to)); }
  if (f.duplicates) where.push('l.is_duplicate_suspect = 1');
  if (f.search) {
    const s = f.search.trim();
    const digits = s.replace(/\D/g, '');
    if (digits.length >= 6) { where.push('l.phone_normalized LIKE ?'); params.push(`%${normalizePhone(digits)}%`); }
    else { where.push('(l.name LIKE ? OR l.email LIKE ? OR l.external_lead_id LIKE ? OR l.interest LIKE ?)'); const q = `%${s}%`; params.push(q, q, q, q); }
  }
  return { where: where.join(' AND '), params };
}

async function loadVisibleLead(req, id, conn = null) {
  const vis = leadVisibilitySql(req);
  const lead = await one(`SELECT l.* FROM leads l WHERE l.id = ? AND ${vis.sql}`, [id, ...vis.params], conn);
  if (!lead) throw notFound('Lead not found');
  return lead;
}

async function activity(leadId, userId, type, meta, conn) {
  await query('INSERT INTO lead_activities (lead_id, user_id, type, meta) VALUES (?, ?, ?, ?)', [leadId, userId, type, meta ? JSON.stringify(meta) : null], conn);
}

async function assertAssignable(userId, websiteId) {
  const u = await one(
    `SELECT u.id, u.full_name FROM users u WHERE u.id = ? AND u.status = 'ACTIVE'
       AND (EXISTS (SELECT 1 FROM user_website_access x WHERE x.user_id = u.id AND x.website_id = ?)
            OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'SUPER_ADMIN'))`,
    [userId, websiteId],
  );
  if (!u) throw badRequest('That user cannot be assigned leads for this website', 'INVALID_ASSIGNEE');
  return u;
}

export const leadService = {
  async list(req, f, { limit, offset }) {
    const { where, params } = buildFilters(req, f);
    const sort = SORTS[f.sort] || SORTS.created_at;
    const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
    const [{ total }] = await query(`SELECT COUNT(*) total ${LIST_FROM} WHERE ${where}`, params);
    const rows = await query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE ${where} ORDER BY ${sort} ${dir}, l.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return { total, rows };
  },

  async detail(req, id) {
    const lead = await loadVisibleLead(req, id);
    const [base, attribution, notes, followups, activities, assignments, duplicates] = await Promise.all([
      one(`SELECT ${LIST_SELECT}, l.message, l.extra, l.team_id, t.name AS team_name, d.name AS department_name
           ${LIST_FROM} LEFT JOIN teams t ON t.id = l.team_id LEFT JOIN departments d ON d.id = t.department_id WHERE l.id = ?`, [id]),
      one('SELECT * FROM lead_attributions WHERE lead_id = ?', [id]),
      query('SELECT n.*, u.full_name AS author FROM lead_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.lead_id = ? ORDER BY n.id DESC', [id]),
      query('SELECT f.*, u.full_name AS owner FROM lead_followups f JOIN users u ON u.id = f.user_id WHERE f.lead_id = ? ORDER BY f.due_at DESC', [id]),
      query('SELECT a.*, u.full_name AS actor FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.lead_id = ? ORDER BY a.id DESC LIMIT 200', [id]),
      query(`SELECT la.*, au.full_name AS assigned_to, pu.full_name AS previous_user, bu.full_name AS assigned_by_name
             FROM lead_assignments la LEFT JOIN users au ON au.id = la.assigned_user_id LEFT JOIN users pu ON pu.id = la.previous_user_id
             LEFT JOIN users bu ON bu.id = la.assigned_by WHERE la.lead_id = ? ORDER BY la.id DESC`, [id]),
      query(`SELECT d.id, d.status, d.match_reasons, d.created_at, c.id AS candidate_id, c.external_lead_id, c.name, c.phone, c.email, w.code AS website_code
             FROM lead_duplicates d JOIN leads c ON c.id = d.candidate_lead_id JOIN websites w ON w.id = c.website_id
             WHERE d.lead_id = ? AND c.website_id IN (?) ORDER BY d.id DESC`, [id, req.auth.ctx.websiteIds]),
    ]);
    return { ...base, merged_into_lead_id: lead.merged_into_lead_id, attribution, notes, followups, activities, assignments, duplicates };
  },

  async create(req, data) {
    websiteScope(req, data.websiteId);
    const website = await one('SELECT * FROM websites WHERE id = ?', [data.websiteId]);
    if (!website) throw notFound('Website not found');
    const status = await one('SELECT id FROM lead_statuses WHERE is_default = 1 AND is_active = 1 ORDER BY sort_order LIMIT 1');
    const rawId = `M${Date.now().toString(36)}${randomToken(3)}`.toUpperCase();
    const id = await transaction(async (conn) => {
      const [r] = await conn.query(
        `INSERT INTO leads (website_id, external_lead_id, external_raw_id, name, phone, phone_normalized, email, email_normalized, location, interest, message, form_type, status_id, assigned_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
        [website.id, `${website.external_id_prefix}-${rawId}`, rawId, data.name, data.phone, normalizePhone(data.phone), data.email, normalizeEmail(data.email),
          data.location, data.interest, data.message, status.id, req.auth.ctx.permissions.has('lead.assign') ? null : req.auth.user.id],
      );
      await conn.query(
        'INSERT INTO lead_attributions (lead_id, source, medium, campaign) VALUES (?, ?, ?, ?)',
        [r.insertId, data.source || 'manual', data.medium || 'offline', data.campaign || null],
      );
      await activity(r.insertId, req.auth.user.id, 'LEAD_CREATED', { manual: true }, conn);
      return r.insertId;
    });
    await audit('LEAD_CREATED', { actorId: req.auth.user.id, entityType: 'lead', entityId: id, req, meta: { manual: true } });
    return { id };
  },

  async update(req, id, data) {
    const lead = await loadVisibleLead(req, id);
    const changes = {};
    for (const k of ['name', 'phone', 'email', 'location', 'interest', 'message']) {
      if (data[k] !== undefined && data[k] !== lead[k]) changes[k] = data[k];
    }
    let statusChange = null;
    if (data.statusId && data.statusId !== lead.status_id) {
      const s = await one('SELECT * FROM lead_statuses WHERE id = ? AND is_active = 1', [data.statusId]);
      if (!s) throw badRequest('Invalid status');
      const prev = await one('SELECT code, name FROM lead_statuses WHERE id = ?', [lead.status_id]);
      statusChange = { from: prev.code, to: s.code, conversion: !!s.is_conversion };
    }
    if (!Object.keys(changes).length && !statusChange) return;
    await transaction(async (conn) => {
      if (Object.keys(changes).length) {
        const cols = Object.keys(changes);
        const extra = [];
        if (changes.phone !== undefined) { extra.push('phone_normalized = ?'); }
        if (changes.email !== undefined) { extra.push('email_normalized = ?'); }
        await conn.query(
          `UPDATE leads SET ${[...cols.map((c) => `${c} = ?`), ...extra].join(', ')} WHERE id = ?`,
          [...cols.map((c) => changes[c]), ...(changes.phone !== undefined ? [normalizePhone(changes.phone)] : []),
            ...(changes.email !== undefined ? [normalizeEmail(changes.email)] : []), id],
        );
        await activity(id, req.auth.user.id, 'LEAD_UPDATED', { fields: cols }, conn);
      }
      if (statusChange) {
        await conn.query(`UPDATE leads SET status_id = ?, converted_at = ${statusChange.conversion ? 'COALESCE(converted_at, NOW(3))' : 'converted_at'} WHERE id = ?`, [data.statusId, id]);
        await activity(id, req.auth.user.id, statusChange.conversion ? 'CONVERTED' : 'STATUS_CHANGED', statusChange, conn);
      }
    });
    if (Object.keys(changes).length) await audit('LEAD_UPDATED', { actorId: req.auth.user.id, entityType: 'lead', entityId: id, req, meta: { fields: Object.keys(changes) } });
    if (statusChange) {
      await audit('LEAD_STATUS_CHANGED', { actorId: req.auth.user.id, entityType: 'lead', entityId: id, req, meta: statusChange });
      const evt = { id, ...statusChange, by: req.auth.user.id };
      emitToWebsite(lead.website_id, EVENTS.LEAD_STATUS_CHANGED, evt);
      if (lead.assigned_user_id && lead.assigned_user_id !== req.auth.user.id) emitToUser(lead.assigned_user_id, EVENTS.LEAD_STATUS_CHANGED, evt);
    }
  },

  /** Assign or reassign. Assigning an unassigned lead needs lead.assign; changing an owner needs lead.reassign. */
  async assign(req, id, { userId, reason }) {
    const lead = await loadVisibleLead(req, id);
    const perms = req.auth.ctx.permissions;
    const isReassign = Boolean(lead.assigned_user_id);
    if (isReassign ? !perms.has('lead.reassign') : !perms.has('lead.assign')) throw forbidden();
    if (lead.assigned_user_id === userId) return;
    const target = userId ? await assertAssignable(userId, lead.website_id) : null;
    await transaction(async (conn) => {
      await conn.query('UPDATE leads SET assigned_user_id = ? WHERE id = ?', [userId || null, id]);
      await conn.query('INSERT INTO lead_assignments (lead_id, assigned_user_id, previous_user_id, assigned_by, reason) VALUES (?, ?, ?, ?, ?)',
        [id, userId || null, lead.assigned_user_id, req.auth.user.id, reason || null]);
      await activity(id, req.auth.user.id, isReassign ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED', { from: lead.assigned_user_id, to: userId, reason }, conn);
    });
    await audit(isReassign ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED', { actorId: req.auth.user.id, entityType: 'lead', entityId: id, req, meta: { from: lead.assigned_user_id, to: userId } });
    const evtName = isReassign ? EVENTS.LEAD_REASSIGNED : EVENTS.LEAD_ASSIGNED;
    const payload = { id, externalLeadId: lead.external_lead_id, name: lead.name, to: userId, from: lead.assigned_user_id };
    emitToWebsite(lead.website_id, evtName, payload);
    if (target) {
      emitToUser(target.id, evtName, payload);
      await notificationService.notify(target.id, {
        type: isReassign ? 'LEAD_REASSIGNED' : 'LEAD_ASSIGNED', title: isReassign ? 'A lead was reassigned to you' : 'New lead assigned to you',
        body: `${lead.name || 'Unnamed'} · ${lead.external_lead_id}`, link: `/crm/leads/${id}`,
      });
    }
    if (isReassign && lead.assigned_user_id && lead.assigned_user_id !== userId) emitToUser(lead.assigned_user_id, EVENTS.LEAD_REASSIGNED, payload);
  },

  async bulk(req, { ids, action, userId, statusId }) {
    const results = { updated: 0, failed: [] };
    for (const id of ids) {
      try {
        if (action === 'assign') await leadService.assign(req, id, { userId, reason: 'bulk' });
        else if (action === 'status') await leadService.update(req, id, { statusId });
        results.updated += 1;
      } catch (err) {
        results.failed.push({ id, message: err.expose ? err.message : 'Failed' });
      }
    }
    return results;
  },

  async remove(req, id) {
    const lead = await loadVisibleLead(req, id);
    await query('DELETE FROM leads WHERE id = ?', [id]);
    await audit('LEAD_DELETED', { actorId: req.auth.user.id, entityType: 'lead', entityId: id, req, meta: { externalLeadId: lead.external_lead_id } });
  },

  async addNote(req, id, body) {
    await loadVisibleLead(req, id);
    const r = await query('INSERT INTO lead_notes (lead_id, user_id, body) VALUES (?, ?, ?)', [id, req.auth.user.id, body]);
    await activity(id, req.auth.user.id, 'NOTE_ADDED', { noteId: r.insertId });
    return { id: r.insertId };
  },

  async addFollowup(req, id, data) {
    const lead = await loadVisibleLead(req, id);
    const ownerId = data.userId && req.auth.ctx.permissions.has('lead.assign') ? data.userId : req.auth.user.id;
    if (ownerId !== req.auth.user.id) await assertAssignable(ownerId, lead.website_id);
    const r = await query(
      'INSERT INTO lead_followups (lead_id, user_id, created_by, due_at, notes, priority) VALUES (?, ?, ?, ?, ?, ?)',
      [id, ownerId, req.auth.user.id, new Date(data.dueAt), data.notes || null, data.priority || 'MEDIUM'],
    );
    await activity(id, req.auth.user.id, 'FOLLOWUP_CREATED', { followupId: r.insertId, dueAt: data.dueAt });
    emitToUser(ownerId, EVENTS.FOLLOWUP_UPDATED, { id: r.insertId, leadId: id });
    return { id: r.insertId };
  },

  async updateFollowup(req, followupId, data) {
    const f = await one('SELECT * FROM lead_followups WHERE id = ?', [followupId]);
    if (!f) throw notFound('Follow-up not found');
    await loadVisibleLead(req, f.lead_id);
    if (f.user_id !== req.auth.user.id && !req.auth.ctx.permissions.has('lead.view_all')) throw forbidden();
    const sets = []; const params = [];
    if (data.dueAt) { sets.push("due_at = ?, status = IF(status = 'OVERDUE', 'UPCOMING', status), reminder_sent_at = NULL, overdue_notified_at = NULL"); params.push(new Date(data.dueAt)); }
    if (data.notes !== undefined) { sets.push('notes = ?'); params.push(data.notes); }
    if (data.priority) { sets.push('priority = ?'); params.push(data.priority); }
    if (data.status) { sets.push('status = ?'); params.push(data.status); if (data.status === 'COMPLETED') sets.push('completed_at = NOW(3)'); }
    if (!sets.length) return;
    await query(`UPDATE lead_followups SET ${sets.join(', ')} WHERE id = ?`, [...params, followupId]);
    if (data.status === 'COMPLETED') await activity(f.lead_id, req.auth.user.id, 'FOLLOWUP_COMPLETED', { followupId });
    emitToUser(f.user_id, EVENTS.FOLLOWUP_UPDATED, { id: followupId, leadId: f.lead_id });
  },

  async listFollowups(req, { scope, status, limit, offset }) {
    const where = ['f.user_id = ?']; const params = [req.auth.user.id];
    if (scope === 'all' && req.auth.ctx.permissions.has('lead.view_all')) { where.length = 0; params.length = 0; where.push('l.website_id IN (?)'); params.push(req.auth.ctx.websiteIds); }
    if (status === 'today') where.push("f.status IN ('UPCOMING','OVERDUE') AND f.due_at < (UTC_DATE() + INTERVAL 1 DAY)");
    else if (status) { where.push('f.status = ?'); params.push(status); }
    const w = where.join(' AND ');
    const [{ total }] = await query(`SELECT COUNT(*) total FROM lead_followups f JOIN leads l ON l.id = f.lead_id WHERE ${w}`, params);
    const rows = await query(
      `SELECT f.*, l.name AS lead_name, l.external_lead_id, w.code AS website_code, u.full_name AS owner
       FROM lead_followups f JOIN leads l ON l.id = f.lead_id JOIN websites w ON w.id = l.website_id JOIN users u ON u.id = f.user_id
       WHERE ${w} ORDER BY f.status = 'COMPLETED', f.due_at ASC LIMIT ? OFFSET ?`, [...params, limit, offset],
    );
    return { total, rows };
  },

  /** Resolve a duplicate pair: KEEP_SEPARATE, or MERGE the candidate into the primary lead (never deletes either record). */
  async resolveDuplicate(req, duplicateId, { action, primaryLeadId }) {
    const d = await one('SELECT * FROM lead_duplicates WHERE id = ?', [duplicateId]);
    if (!d || d.status !== 'OPEN') throw notFound('Open duplicate not found');
    const a = await loadVisibleLead(req, d.lead_id);
    const b = await loadVisibleLead(req, d.candidate_lead_id);
    if (action === 'KEEP_SEPARATE') {
      await query("UPDATE lead_duplicates SET status = 'KEPT_SEPARATE', resolved_by = ?, resolved_at = NOW(3) WHERE id = ?", [req.auth.user.id, duplicateId]);
      await audit('LEAD_DUPLICATE_KEPT', { actorId: req.auth.user.id, entityType: 'lead', entityId: a.id, req, meta: { candidate: b.id } });
    } else {
      const primary = primaryLeadId === b.id ? b : a;
      const secondary = primary.id === a.id ? b : a;
      await transaction(async (conn) => {
        await conn.query(
          `UPDATE leads p JOIN leads s ON s.id = ? SET p.name = COALESCE(p.name, s.name), p.phone = COALESCE(p.phone, s.phone),
             p.phone_normalized = COALESCE(p.phone_normalized, s.phone_normalized), p.email = COALESCE(p.email, s.email),
             p.email_normalized = COALESCE(p.email_normalized, s.email_normalized), p.location = COALESCE(p.location, s.location),
             p.interest = COALESCE(p.interest, s.interest) WHERE p.id = ?`, [secondary.id, primary.id],
        );
        await conn.query('UPDATE lead_notes SET lead_id = ? WHERE lead_id = ?', [primary.id, secondary.id]);
        await conn.query("UPDATE lead_followups SET lead_id = ? WHERE lead_id = ? AND status <> 'COMPLETED'", [primary.id, secondary.id]);
        await conn.query('UPDATE leads SET merged_into_lead_id = ? WHERE id = ?', [primary.id, secondary.id]);
        await conn.query("UPDATE lead_duplicates SET status = 'MERGED', resolved_by = ?, resolved_at = NOW(3) WHERE id = ?", [req.auth.user.id, duplicateId]);
        await activity(primary.id, req.auth.user.id, 'LEAD_MERGED', { mergedLeadId: secondary.id, mergedExternalId: secondary.external_lead_id }, conn);
        await activity(secondary.id, req.auth.user.id, 'LEAD_MERGED', { mergedInto: primary.id }, conn);
      });
      await audit('LEAD_MERGED', { actorId: req.auth.user.id, entityType: 'lead', entityId: primary.id, req, meta: { merged: secondary.id, mergedExternalId: secondary.external_lead_id } });
    }
    const remaining = await one("SELECT COUNT(*) c FROM lead_duplicates WHERE lead_id = ? AND status = 'OPEN'", [a.id]);
    if (!remaining.c) await query('UPDATE leads SET is_duplicate_suspect = 0 WHERE id = ?', [a.id]);
  },

  /** CSV export (server-side, capped). */
  async exportCsv(req, f) {
    const { where, params } = buildFilters(req, f);
    const rows = await query(`SELECT ${LIST_SELECT}, a.utm_medium, a.utm_term, a.utm_content, a.landing_page, a.referrer ${LIST_FROM} WHERE ${where} ORDER BY l.created_at DESC LIMIT 10000`, params);
    await audit('LEAD_EXPORTED', { actorId: req.auth.user.id, req, meta: { count: rows.length, filters: f } });
    const cols = ['external_lead_id', 'website_code', 'name', 'phone', 'email', 'location', 'interest', 'status_name', 'assigned_user_name', 'source', 'medium',
      'campaign', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing_page', 'referrer', 'created_at'];
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      let s = v instanceof Date ? v.toISOString() : String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  },

  /** Per-pipeline counts for navigation and the dashboard (respects website access and visibility). */
  async pipelineCounts(req) {
    const vis = leadVisibilitySql(req);
    const out = {};
    for (const [key, p] of Object.entries(PIPELINES)) {
      const junkCol = key === 'career' ? "NULLIF(l.junk_reason, 'career')" : 'l.junk_reason';
      const [r] = await query(
        `SELECT COUNT(*) total, SUM(s.code = 'NEW') new_leads, SUM(l.assigned_user_id IS NULL) unassigned, SUM(s.is_conversion) converted,
           SUM(${RECEIVED} >= UTC_DATE()) today,
           SUM(EXISTS (SELECT 1 FROM lead_followups f WHERE f.lead_id = l.id AND (f.status = 'OVERDUE' OR (f.status = 'UPCOMING' AND f.due_at < NOW(3))))) overdue
         FROM leads l JOIN lead_statuses s ON s.id = l.status_id
         WHERE ${vis.sql} AND l.merged_into_lead_id IS NULL AND ${junkCol} IS NULL AND ${p.sql}`,
        [...vis.params, ...p.params],
      );
      out[key] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v || 0)]));
    }
    const forms = await query(
      `SELECT w.code website, l.form_type, COUNT(*) c FROM leads l JOIN websites w ON w.id = l.website_id
       WHERE ${vis.sql} AND l.form_type IS NOT NULL GROUP BY w.code, l.form_type ORDER BY c DESC`, vis.params,
    );
    return { counts: out, formTypes: forms };
  },

  statuses: () => query('SELECT * FROM lead_statuses ORDER BY sort_order'),
  sources: () => query('SELECT * FROM lead_sources WHERE is_active = 1 ORDER BY name'),

  /** Users the caller can assign leads to (active, with access to the website). */
  assignableUsers(req, websiteId) {
    const ids = websiteId ? websiteScope(req, websiteId) : req.auth.ctx.websiteIds;
    return query(
      `SELECT DISTINCT u.id, u.full_name, u.email FROM users u JOIN user_website_access x ON x.user_id = u.id
       WHERE u.status = 'ACTIVE' AND x.website_id IN (?) ORDER BY u.full_name`, [ids.length ? ids : [0]],
    );
  },
};
