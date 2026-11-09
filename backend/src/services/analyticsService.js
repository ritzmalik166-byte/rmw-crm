import { query, one } from '../config/db.js';
import { leadVisibilitySql, websiteScope } from '../middleware/scope.js';

function range(f) {
  const to = f.to ? new Date(f.to) : new Date();
  const from = f.from ? new Date(f.from) : new Date(to.getTime() - 30 * 86400_000);
  return { from, to };
}

function scopeSql(req, f) {
  const vis = leadVisibilitySql(req);
  const { from, to } = range(f);
  const where = [vis.sql, 'l.merged_into_lead_id IS NULL', 'l.junk_reason IS NULL', 'COALESCE(l.external_created_at, l.created_at) BETWEEN ? AND ?'];
  const params = [...vis.params, from, to];
  if (f.websiteId) { websiteScope(req, f.websiteId); where.push('l.website_id = ?'); params.push(Number(f.websiteId)); }
  return { where: where.join(' AND '), params, from, to };
}

export const analyticsService = {
  async overview(req, f) {
    const { where, params, from, to } = scopeSql(req, f);
    const base = 'FROM leads l JOIN lead_statuses s ON s.id = l.status_id JOIN websites w ON w.id = l.website_id LEFT JOIN lead_attributions a ON a.lead_id = l.id';
    const [totals, byWebsite, byStatus, bySource, byCampaign, byDay, byUser] = await Promise.all([
      one(`SELECT COUNT(*) total, SUM(s.is_conversion) converted, SUM(l.assigned_user_id IS NULL) unassigned, SUM(s.code = 'NEW') new_leads ${base} WHERE ${where}`, params),
      query(`SELECT w.code, w.name, COUNT(*) total, SUM(s.is_conversion) converted ${base} WHERE ${where} GROUP BY w.id ORDER BY w.id`, params),
      query(`SELECT s.code, s.name, s.color, COUNT(*) total ${base} WHERE ${where} GROUP BY s.id ORDER BY s.sort_order`, params),
      query(`SELECT COALESCE(a.source, 'unknown') source, COALESCE(a.medium, '') medium, COUNT(*) total, SUM(s.is_conversion) converted ${base} WHERE ${where} GROUP BY 1, 2 ORDER BY total DESC LIMIT 15`, params),
      query(`SELECT COALESCE(a.campaign, a.utm_campaign) campaign, COUNT(*) total, SUM(s.is_conversion) converted ${base} WHERE ${where} AND COALESCE(a.campaign, a.utm_campaign) IS NOT NULL GROUP BY 1 ORDER BY total DESC LIMIT 15`, params),
      query(`SELECT DATE(COALESCE(l.external_created_at, l.created_at)) day, w.code, COUNT(*) total ${base} WHERE ${where} GROUP BY 1, 2 ORDER BY 1`, params),
      query(`SELECT u.id, u.full_name, COUNT(*) total, SUM(s.is_conversion) converted, SUM(s.is_closed = 0) open_leads
             ${base} JOIN users u ON u.id = l.assigned_user_id WHERE ${where} GROUP BY u.id ORDER BY total DESC LIMIT 20`, params),
    ]);
    const total = Number(totals.total || 0);
    const converted = Number(totals.converted || 0);
    return {
      range: { from, to },
      totals: { total, converted, unassigned: Number(totals.unassigned || 0), newLeads: Number(totals.new_leads || 0), conversionRate: total ? +(converted / total * 100).toFixed(1) : 0 },
      byWebsite, byStatus, bySource, byCampaign, byDay, byUser,
    };
  },

  /** Personal / team dashboard numbers. */
  async myDashboard(req) {
    const uid = req.auth.user.id;
    const [mine, fu, recent] = await Promise.all([
      one(`SELECT COUNT(*) total, SUM(s.code = 'NEW') new_leads, SUM(s.is_conversion) converted,
             SUM(s.is_conversion AND l.converted_at > NOW(3) - INTERVAL 30 DAY) converted_30d
           FROM leads l JOIN lead_statuses s ON s.id = l.status_id WHERE l.assigned_user_id = ? AND l.merged_into_lead_id IS NULL`, [uid]),
      one(`SELECT SUM(status IN ('UPCOMING','OVERDUE') AND due_at < UTC_DATE() + INTERVAL 1 DAY AND due_at >= UTC_DATE()) today,
             SUM(status = 'OVERDUE' OR (status = 'UPCOMING' AND due_at < NOW(3))) overdue, SUM(status = 'UPCOMING') upcoming
           FROM lead_followups WHERE user_id = ?`, [uid]),
      query(`SELECT l.id, l.external_lead_id, l.name, l.interest, w.code website_code, s.name status_name, s.color status_color, l.created_at
             FROM leads l JOIN websites w ON w.id = l.website_id JOIN lead_statuses s ON s.id = l.status_id
             WHERE l.assigned_user_id = ? AND l.merged_into_lead_id IS NULL ORDER BY l.created_at DESC LIMIT 8`, [uid]),
    ]);
    const num = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(v || 0)]));
    return { leads: num(mine), followups: num(fu), recent };
  },

  async teamDashboard(req) {
    const ids = req.auth.ctx.websiteIds.length ? req.auth.ctx.websiteIds : [0];
    const [t, fu, perf] = await Promise.all([
      one(`SELECT COUNT(*) total, SUM(l.assigned_user_id IS NULL) unassigned, SUM(s.code = 'NEW') new_leads,
             SUM(s.is_conversion AND l.converted_at > NOW(3) - INTERVAL 30 DAY) converted_30d
           FROM leads l JOIN lead_statuses s ON s.id = l.status_id WHERE l.website_id IN (?) AND l.merged_into_lead_id IS NULL`, [ids]),
      one(`SELECT SUM(f.status IN ('UPCOMING','OVERDUE') AND f.due_at < UTC_DATE() + INTERVAL 1 DAY) due_today,
             SUM(f.status = 'OVERDUE' OR (f.status = 'UPCOMING' AND f.due_at < NOW(3))) overdue
           FROM lead_followups f JOIN leads l ON l.id = f.lead_id WHERE l.website_id IN (?)`, [ids]),
      query(`SELECT u.id, u.full_name, COUNT(l.id) assigned, SUM(s.is_conversion) converted, SUM(s.is_closed = 0) open_leads
             FROM users u JOIN leads l ON l.assigned_user_id = u.id JOIN lead_statuses s ON s.id = l.status_id
             WHERE l.website_id IN (?) AND l.merged_into_lead_id IS NULL GROUP BY u.id ORDER BY assigned DESC LIMIT 15`, [ids]),
    ]);
    const num = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Number(v || 0)]));
    return { leads: num(t), followups: num(fu), teamPerformance: perf };
  },

  recentActivity: (req) => query(
    `SELECT a.id, a.type, a.created_at, a.lead_id, l.name AS lead_name, l.external_lead_id, u.full_name AS actor
     FROM lead_activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id
     WHERE l.website_id IN (?) ORDER BY a.id DESC LIMIT 20`, [req.auth.ctx.websiteIds.length ? req.auth.ctx.websiteIds : [0]],
  ),
};
