import { Router } from 'express';
import { crmController as c } from '../controllers/crmController.js';
import { authenticate, requireArea, requirePermission, requireAnyPermission } from '../middleware/auth.js';
import { validate } from '../validators/common.js';
import { leads as s, notifications as n } from '../validators/schemas.js';
import { asyncHandler as h } from '../utils/http.js';

const r = Router();
r.use(authenticate, requireArea('crm'));

r.get('/dashboard', h(c.dashboard));
r.get('/lookups', h(c.lookups));
r.get('/pipelines', requirePermission('lead.view'), h(c.pipelines));

r.get('/leads', requirePermission('lead.view'), validate(s.listQuery, 'query'), h(c.listLeads));
r.get('/leads/export', requirePermission('lead.export'), validate(s.listQuery, 'query'), h(c.exportLeads));
r.post('/leads', requirePermission('lead.create'), validate(s.create), h(c.createLead));
r.post('/leads/bulk', requireAnyPermission('lead.assign', 'lead.reassign', 'lead.edit'), validate(s.bulk), h(c.bulk));
r.get('/leads/:id', requirePermission('lead.view'), h(c.getLead));
r.patch('/leads/:id', requirePermission('lead.edit'), validate(s.update), h(c.updateLead));
r.delete('/leads/:id', requirePermission('lead.delete'), h(c.deleteLead));
r.post('/leads/:id/assign', requireAnyPermission('lead.assign', 'lead.reassign'), validate(s.assign), h(c.assignLead));
r.post('/leads/:id/notes', requirePermission('lead.view'), validate(s.note), h(c.addNote));
r.post('/leads/:id/followups', requirePermission('lead.view'), validate(s.followup), h(c.addFollowup));
r.post('/duplicates/:id/resolve', requirePermission('lead.merge'), validate(s.duplicate), h(c.resolveDuplicate));

r.get('/followups', validate(s.followupQuery, 'query'), h(c.listFollowups));
r.patch('/followups/:id', validate(s.followupUpdate), h(c.updateFollowup));

r.get('/notifications', validate(n.listQuery, 'query'), h(c.notifications));
r.get('/notifications/unread-count', h(c.unreadCount));
r.post('/notifications/read-all', h(c.markAllRead));
r.post('/notifications/:id/read', h(c.markRead));
r.get('/notifications/preferences', h(c.getPrefs));
r.put('/notifications/preferences', validate(n.prefs), h(c.setPrefs));
r.get('/push/public-key', h(c.pushKey));
r.post('/push/subscribe', validate(n.subscribe), h(c.pushSubscribe));
r.post('/push/unsubscribe', validate(n.unsubscribe), h(c.pushUnsubscribe));

export default r;
