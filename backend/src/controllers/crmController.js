import { leadService } from '../services/leadService.js';
import { analyticsService } from '../services/analyticsService.js';
import { notificationService } from '../notifications/notificationService.js';
import { pushService } from '../notifications/pushService.js';
import { ok, pageMeta } from '../utils/http.js';

const paged = (q) => ({ limit: q.limit, offset: (q.page - 1) * q.limit });

export const crmController = {
  async dashboard(req, res) {
    const p = req.auth.ctx.permissions;
    const [mine, team, activity] = await Promise.all([
      analyticsService.myDashboard(req),
      p.has('lead.view_all') ? analyticsService.teamDashboard(req) : null,
      p.has('lead.view_all') ? analyticsService.recentActivity(req) : [],
    ]);
    ok(res, { mine, team, activity });
  },

  async listLeads(req, res) {
    const q = req.validQuery;
    const { total, rows } = await leadService.list(req, q, paged(q));
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async exportLeads(req, res) {
    const csv = await leadService.exportCsv(req, req.validQuery);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${csv}`);
  },
  async getLead(req, res) { ok(res, await leadService.detail(req, Number(req.params.id))); },
  async createLead(req, res) { ok(res, await leadService.create(req, req.body), 'Lead created', 201); },
  async updateLead(req, res) { await leadService.update(req, Number(req.params.id), req.body); ok(res, null, 'Lead updated'); },
  async deleteLead(req, res) { await leadService.remove(req, Number(req.params.id)); ok(res, null, 'Lead deleted'); },
  async assignLead(req, res) { await leadService.assign(req, Number(req.params.id), req.body); ok(res, null, 'Assignment updated'); },
  async bulk(req, res) { ok(res, await leadService.bulk(req, req.body)); },
  async addNote(req, res) { ok(res, await leadService.addNote(req, Number(req.params.id), req.body.body), 'Note added', 201); },
  async addFollowup(req, res) { ok(res, await leadService.addFollowup(req, Number(req.params.id), req.body), 'Follow-up scheduled', 201); },
  async updateFollowup(req, res) { await leadService.updateFollowup(req, Number(req.params.id), req.body); ok(res, null, 'Follow-up updated'); },
  async listFollowups(req, res) {
    const q = req.validQuery;
    const { total, rows } = await leadService.listFollowups(req, { ...q, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total) });
  },
  async resolveDuplicate(req, res) { await leadService.resolveDuplicate(req, Number(req.params.id), req.body); ok(res, null, 'Duplicate resolved'); },
  async pipelines(req, res) { ok(res, await leadService.pipelineCounts(req)); },
  async lookups(req, res) {
    const [statuses, sources, users] = await Promise.all([leadService.statuses(), leadService.sources(), leadService.assignableUsers(req)]);
    ok(res, { statuses, sources, websites: req.auth.ctx.websites, users });
  },

  async notifications(req, res) {
    const q = req.validQuery;
    const { total, rows } = await notificationService.list(req.auth.user.id, { unreadOnly: q.unreadOnly, ...paged(q) });
    ok(res, { rows, meta: pageMeta(q.page, q.limit, total), unread: await notificationService.unreadCount(req.auth.user.id) });
  },
  async unreadCount(req, res) { ok(res, { unread: await notificationService.unreadCount(req.auth.user.id) }); },
  async markRead(req, res) { await notificationService.markRead(req.auth.user.id, Number(req.params.id)); ok(res); },
  async markAllRead(req, res) { await notificationService.markAllRead(req.auth.user.id); ok(res); },
  async getPrefs(req, res) { ok(res, await notificationService.getPreferences(req.auth.user.id)); },
  async setPrefs(req, res) { await notificationService.setPreferences(req.auth.user.id, req.body.preferences); ok(res, null, 'Preferences saved'); },
  async pushKey(_req, res) { ok(res, { publicKey: pushService.publicKey() }); },
  async pushSubscribe(req, res) { await pushService.subscribe(req.auth.user.id, req.body, req.get('user-agent')); ok(res, null, 'Push enabled'); },
  async pushUnsubscribe(req, res) { await pushService.unsubscribe(req.auth.user.id, req.body.endpoint); ok(res, null, 'Push disabled'); },
};
