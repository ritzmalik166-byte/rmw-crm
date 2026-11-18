/**
 * Meta Ads analytics from CRM data only (no estimates). A lead's funnel stage is the furthest stage it ever reached:
 * the higher of its current status and every status it moved through (lead_activities), so a lead that went
 * Qualified -> Lost still counts as qualified.
 */
import { query } from '../../config/db.js';
import { leadVisibilitySql, websiteScope } from '../../middleware/scope.js';
import { parseBound } from '../../utils/dateRange.js';
import { LEAD_SOURCE_TYPES } from '../../config/leadSources.js';
import { metaConnectionRepo } from './metaConnection.repo.js';
import { graph } from './metaApi.service.js';

export const FUNNEL_STAGES = [
  { key: 'leads', label: 'Meta leads', rank: 0 },
  { key: 'contacted', label: 'Contacted', rank: 1 },
  { key: 'qualified', label: 'Qualified', rank: 2 },
  { key: 'siteVisit', label: 'Site visit', rank: 3 },
  { key: 'negotiation', label: 'Negotiation', rank: 4 },
  { key: 'converted', label: 'Converted', rank: 5 },
];

const rankOf = (expr) => `(CASE ${expr} WHEN 'CONVERTED' THEN 5 WHEN 'NEGOTIATION' THEN 4 WHEN 'SITE_VISIT' THEN 3 WHEN 'QUALIFIED' THEN 2
  WHEN 'CONTACTED' THEN 1 WHEN 'INTERESTED' THEN 1 WHEN 'FOLLOW_UP' THEN 1 ELSE 0 END)`;

const STAGE_SQL = `GREATEST(${rankOf('s.code')}, IF(s.is_conversion = 1, 5, 0), COALESCE((
    SELECT MAX(${rankOf("JSON_UNQUOTE(JSON_EXTRACT(act.meta, '$.to'))")}) FROM lead_activities act
    WHERE act.lead_id = l.id AND act.type IN ('STATUS_CHANGED', 'CONVERTED')), 0))`;

const RECEIVED = 'COALESCE(l.external_created_at, l.created_at)';
const IST = "'+05:30'";

/** Conversion % between consecutive stages and from the top. Pure; exported for tests. */
export function funnelFromCounts(counts) {
  const top = Number(counts.leads || 0);
  return FUNNEL_STAGES.map((s, i) => {
    const count = Number(counts[s.key] || 0);
    const prev = i === 0 ? count : Number(counts[FUNNEL_STAGES[i - 1].key] || 0);
    return {
      key: s.key, label: s.label, count,
      pctOfTotal: top ? +((count / top) * 100).toFixed(1) : 0,
      pctOfPrevious: i === 0 ? 100 : prev ? +((count / prev) * 100).toFixed(1) : 0,
    };
  });
}

function filters(req, f) {
  const vis = leadVisibilitySql(req);
  const to = parseBound(f.to, true) || new Date();
  const from = parseBound(f.from) || new Date(to.getTime() - 30 * 86400_000);
  const where = [vis.sql, 'l.source_type = ?', 'l.merged_into_lead_id IS NULL', `${RECEIVED} BETWEEN ? AND ?`];
  const params = [...vis.params, LEAD_SOURCE_TYPES.META, from, to];
  if (f.websiteId) { websiteScope(req, f.websiteId); where.push('l.website_id = ?'); params.push(Number(f.websiteId)); }
  if (f.pageId) { where.push('l.page_id = ?'); params.push(f.pageId); }
  if (f.campaignId) { where.push('l.campaign_id = ?'); params.push(f.campaignId); }
  if (f.adSetId) { where.push('l.ad_set_id = ?'); params.push(f.adSetId); }
  if (f.adId) { where.push('l.ad_id = ?'); params.push(f.adId); }
  if (f.formId) { where.push('l.form_id = ?'); params.push(f.formId); }
  if (f.statusId) { where.push('l.status_id = ?'); params.push(Number(f.statusId)); }
  if (f.platform) { where.push('a.source = ?'); params.push(f.platform); }
  if (f.assignedUserId === 'unassigned') where.push('l.assigned_user_id IS NULL');
  else if (f.assignedUserId) { where.push('l.assigned_user_id = ?'); params.push(Number(f.assignedUserId)); }
  return { where: where.join(' AND '), params, from, to };
}

const FROM = 'FROM leads l JOIN lead_statuses s ON s.id = l.status_id LEFT JOIN lead_attributions a ON a.lead_id = l.id';
const n = (v) => Number(v || 0);

export const metaAnalytics = {
  async overview(req, f) {
    const { where, params, from, to } = filters(req, f);
    const realWhere = `${where} AND l.junk_reason IS NULL`;
    const staged = `SELECT l.id, l.campaign_id, l.campaign_name, s.code, ${STAGE_SQL} AS stage ${FROM} WHERE ${realWhere}`;
    const istDate = (d) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

    const [totals, campaigns, spend, byDay, excluded, options] = await Promise.all([
      query(`SELECT COUNT(*) total, SUM(x.code = 'NEW') new_leads, SUM(x.stage >= 1) contacted, SUM(x.stage >= 2) qualified,
               SUM(x.stage >= 3) site_visit, SUM(x.stage >= 4) negotiation, SUM(x.stage >= 5) converted FROM (${staged}) x`, params),
      query(`SELECT x.campaign_id, MAX(x.campaign_name) campaign_name, COUNT(*) leads, SUM(x.stage >= 2) qualified,
               SUM(x.stage >= 3) site_visits, SUM(x.stage >= 5) converted FROM (${staged}) x
             GROUP BY x.campaign_id ORDER BY leads DESC LIMIT 50`, params),
      query(`SELECT i.campaign_id, SUM(i.spend) spend, MAX(i.currency) currency FROM meta_campaign_insights i
             WHERE i.date BETWEEN ? AND ? GROUP BY i.campaign_id`, [istDate(from), istDate(to)]),
      query(`SELECT DATE(CONVERT_TZ(${RECEIVED}, '+00:00', ${IST})) day, COUNT(*) total ${FROM} WHERE ${realWhere} GROUP BY 1 ORDER BY 1`, params),
      query(`SELECT COUNT(*) c ${FROM} WHERE ${where} AND l.junk_reason IS NOT NULL`, params),
      metaAnalytics.filterOptions(req),
    ]);

    const t = totals[0] || {};
    const spendBy = new Map(spend.map((r) => [r.campaign_id, { spend: Number(r.spend || 0), currency: r.currency }]));
    const hasSpend = spend.length > 0;
    const campaignRows = campaigns.map((c) => {
      const s = c.campaign_id ? spendBy.get(c.campaign_id) : null;
      const leads = n(c.leads);
      return {
        campaignId: c.campaign_id, campaignName: c.campaign_name || (c.campaign_id ? `Campaign ${c.campaign_id}` : 'Unknown / organic'),
        leads, qualified: n(c.qualified), siteVisits: n(c.site_visits), converted: n(c.converted),
        spend: s ? +s.spend.toFixed(2) : null, currency: s?.currency || null,
        cpl: s && leads ? +(s.spend / leads).toFixed(2) : null,
      };
    });
    const totalSpend = campaignRows.reduce((acc, r) => acc + (r.spend || 0), 0);
    const counts = { leads: n(t.total), contacted: n(t.contacted), qualified: n(t.qualified), siteVisit: n(t.site_visit), negotiation: n(t.negotiation), converted: n(t.converted) };

    return {
      range: { from, to },
      totals: {
        total: counts.leads, newLeads: n(t.new_leads), qualified: counts.qualified, siteVisits: counts.siteVisit, converted: counts.converted,
        conversionRate: counts.leads ? +((counts.converted / counts.leads) * 100).toFixed(1) : 0,
        spend: hasSpend ? +totalSpend.toFixed(2) : null,
        cpl: hasSpend && counts.leads ? +(totalSpend / counts.leads).toFixed(2) : null,
        currency: spend[0]?.currency || null,
        excludedJunk: n(excluded[0]?.c),
      },
      funnel: funnelFromCounts(counts),
      campaigns: campaignRows,
      byDay: byDay.map((r) => ({ day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10), total: n(r.total) })),
      spendAvailable: hasSpend,
      options,
    };
  },

  /**
   * Meta lead forms with lead counts (caller's visible leads; junk excluded). Forms synced from Meta that have no
   * leads yet are included with zero counts. `from`/`to` add an in-range count for the dashboard.
   */
  async leadForms(req, f = {}) {
    const vis = leadVisibilitySql(req);
    const from = parseBound(f.from);
    const to = parseBound(f.to, true);
    const where = [vis.sql, 'l.source_type = ?', 'l.merged_into_lead_id IS NULL', 'l.junk_reason IS NULL', 'l.form_id IS NOT NULL'];
    const params = [...vis.params, LEAD_SOURCE_TYPES.META];
    if (f.websiteId) { websiteScope(req, f.websiteId); where.push('l.website_id = ?'); params.push(Number(f.websiteId)); }
    const inRange = from && to ? `SUM(${RECEIVED} BETWEEN ? AND ?)` : 'NULL';
    const [counts, forms] = await Promise.all([
      query(`SELECT l.form_id, MAX(l.form_name) name, MAX(l.page_id) page_id, COUNT(*) total, SUM(s.code = 'NEW') new_leads, SUM(l.assigned_user_id IS NULL) unassigned,
               SUM(s.is_conversion) converted, MAX(${RECEIVED}) last_lead_at, ${inRange} in_range ${FROM}
             WHERE ${where.join(' AND ')} GROUP BY l.form_id`, [...(from && to ? [from, to] : []), ...params]),
      query("SELECT f.form_id, f.name, f.status, f.page_id, a.name page_name FROM meta_forms f LEFT JOIN meta_assets a ON a.asset_type = 'PAGE' AND a.external_id = f.page_id AND a.connection_id = f.connection_id"),
    ]);
    const byId = new Map(forms.map((x) => [x.form_id, x]));
    const rows = counts.map((c) => {
      const m = byId.get(c.form_id);
      byId.delete(c.form_id);
      return { formId: c.form_id, name: m?.name || c.name || `Form ${c.form_id}`, status: m?.status || null, pageId: m?.page_id || c.page_id || null, pageName: m?.page_name || null,
        total: n(c.total), newLeads: n(c.new_leads), unassigned: n(c.unassigned), converted: n(c.converted), inRange: c.in_range == null ? null : n(c.in_range), lastLeadAt: c.last_lead_at };
    });
    for (const m of byId.values()) {
      rows.push({ formId: m.form_id, name: m.name || `Form ${m.form_id}`, status: m.status, pageId: m.page_id, pageName: m.page_name, total: 0, newLeads: 0, unassigned: 0, converted: 0, inRange: from && to ? 0 : null, lastLeadAt: null });
    }
    return rows.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
  },

  /**
   * One card per Facebook Page for the Meta Leads screen: active Pages plus any Page that already has leads the caller
   * can see. Counts respect lead visibility; junk excluded. The picture is Facebook's public Page picture URL.
   */
  async pageCards(req) {
    const vis = leadVisibilitySql(req);
    const [pages, counts] = await Promise.all([
      query(`SELECT a.external_id id, MAX(a.name) name, MAX(a.is_selected) active, MAX(a.meta) meta FROM meta_assets a
             JOIN meta_connections c ON c.id = a.connection_id AND c.status <> 'DISCONNECTED'
             WHERE a.asset_type = 'PAGE' GROUP BY a.external_id`),
      query(`SELECT l.page_id, COUNT(*) total, SUM(s.code = 'NEW') new_leads,
               SUM(${RECEIVED} >= CONVERT_TZ(DATE(CONVERT_TZ(NOW(), '+00:00', ${IST})), ${IST}, '+00:00')) today, MAX(${RECEIVED}) last_lead_at
             ${FROM} WHERE ${vis.sql} AND l.source_type = ? AND l.merged_into_lead_id IS NULL AND l.junk_reason IS NULL AND l.page_id IS NOT NULL
             GROUP BY l.page_id`, [...vis.params, LEAD_SOURCE_TYPES.META]),
    ]);
    const byPage = new Map(counts.map((c) => [String(c.page_id), c]));
    // Pages that have leads but are not stored (e.g. not ticked at the last Meta login): add a card for them too,
    // with the name looked up from Meta once and saved as a switched-off Page.
    const known = new Set(pages.map((p) => String(p.id)));
    const missing = [...byPage.keys()].filter((id) => !known.has(id) && /^\d{1,32}$/.test(id));
    if (missing.length) {
      const conn = await metaConnectionRepo.current();
      const token = conn && conn.status !== 'DISCONNECTED' ? metaConnectionRepo.userToken(conn) : null;
      for (const id of missing) {
        let name = null;
        if (token) name = (await graph(id, { token, params: { fields: 'name' } }).catch(() => null))?.name || null;
        if (conn && name) {
          await query(`INSERT IGNORE INTO meta_assets (connection_id, asset_type, external_id, name, is_selected) VALUES (?, 'PAGE', ?, ?, 0)`,
            [conn.id, id, name.slice(0, 255)]);
        }
        pages.push({ id, name, active: 0, meta: null });
      }
    }
    // Every Page the connection knows (on or off, with or without leads) gets its own card.
    return pages
      .map((p) => {
        const c = byPage.get(String(p.id)) || {};
        let meta = {};
        try { meta = typeof p.meta === 'string' ? JSON.parse(p.meta) : p.meta || {}; } catch { meta = {}; }
        return {
          id: String(p.id), name: p.name || `Page ${p.id}`, active: Boolean(Number(p.active)), category: meta.category || null,
          picture: `https://graph.facebook.com/${p.id}/picture?type=large`,
          total: n(c.total), newLeads: n(c.new_leads), today: n(c.today), lastLeadAt: c.last_lead_at || null,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  },

  /** Values for the filter dropdowns (only what exists in the caller's visible Meta leads). */
  async filterOptions(req) {
    const vis = leadVisibilitySql(req);
    const base = `FROM leads l WHERE ${vis.sql} AND l.source_type = ? AND l.merged_into_lead_id IS NULL`;
    const p = [...vis.params, LEAD_SOURCE_TYPES.META];
    const [campaigns, adSets, ads, forms, users] = await Promise.all([
      query(`SELECT l.campaign_id id, MAX(l.campaign_name) name ${base} AND l.campaign_id IS NOT NULL GROUP BY l.campaign_id ORDER BY name LIMIT 200`, p),
      query(`SELECT l.ad_set_id id, MAX(l.ad_set_name) name, MAX(l.campaign_id) campaign_id ${base} AND l.ad_set_id IS NOT NULL GROUP BY l.ad_set_id ORDER BY name LIMIT 300`, p),
      query(`SELECT l.ad_id id, MAX(l.ad_name) name, MAX(l.ad_set_id) ad_set_id ${base} AND l.ad_id IS NOT NULL GROUP BY l.ad_id ORDER BY name LIMIT 500`, p),
      query(`SELECT l.form_id id, MAX(l.form_name) name ${base} AND l.form_id IS NOT NULL GROUP BY l.form_id ORDER BY name LIMIT 200`, p),
      query(`SELECT DISTINCT u.id, u.full_name name ${base.replace('FROM leads l', 'FROM leads l JOIN users u ON u.id = l.assigned_user_id')} ORDER BY name`, p),
    ]);
    return { campaigns, adSets, ads, forms, users };
  },
};
