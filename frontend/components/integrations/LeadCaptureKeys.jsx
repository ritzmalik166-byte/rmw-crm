'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, KeyRound, Plus, Code2, Trash2, Pencil, Link2 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { confirmAction } from '@/components/ui/confirm';
const KEY = ['lead-capture-keys'];

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error('Copy failed; select and copy manually'); }
}

function CodeBlock({ label, code }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-700">{label}</p>
        <Button size="sm" variant="ghost" onClick={() => copy(code, label)}><Copy />Copy</Button>
      </div>
      <pre className="max-h-64 overflow-auto rounded-md border bg-slate-950 p-3 text-[11.5px] leading-relaxed text-slate-100"><code>{code}</code></pre>
    </div>
  );
}

function snippets(endpoint, apiKey, project) {
  const q = new URLSearchParams({ api_key: apiKey, name: 'dora', email: 'dora@gmail.com', phone: '9299999990', message: 'test', ...(project ? { project } : {}), utm_source: 'google', utm_medium: 'cpc', utm_campaign: '{campaignid}', gclid: 'TEST-GCLID' });
  const getUrl = `${endpoint}?${q.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')}`;
  const script = `<!-- RMW CRM lead capture: put once on every landing page, before </body> -->
<script>
(function () {
  var ENDPOINT = '${endpoint}';
  var API_KEY = '${apiKey}';
  var TRACK = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  // 1. Remember the Google Ads click (gclid) and UTM tags from the ad URL for 90 days.
  var qs = new URLSearchParams(location.search);
  TRACK.forEach(function (k) { if (qs.get(k)) try { localStorage.setItem('crm_' + k, qs.get(k)); } catch (e) {} });
  if (!sessionStorage.getItem('crm_landing')) try { sessionStorage.setItem('crm_landing', location.href); } catch (e) {}

  // 2. Every form with data-crm-form sends its fields + tracking to the CRM.
  document.querySelectorAll('form[data-crm-form]').forEach(function (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var data = Object.fromEntries(new FormData(form).entries());
      data.api_key = API_KEY;
      data.form_name = form.getAttribute('data-crm-form') || 'Landing page';
      data.page_url = location.href;
      data.landing_page = sessionStorage.getItem('crm_landing') || location.href;
      data.referrer = document.referrer;
      TRACK.forEach(function (k) { var v = localStorage.getItem('crm_' + k); if (v && !data[k]) data[k] = v; });
      var btn = form.querySelector('[type=submit]'); if (btn) btn.disabled = true;
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.success) throw new Error(r.message);
          var thanks = form.getAttribute('data-thank-you');
          if (thanks) location.href = thanks; else { form.reset(); alert('Thank you! We will contact you shortly.'); }
        })
        .catch(function (e) { alert(e.message || 'Could not submit, please try again.'); })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  });
})();
</script>`;
  const form = `<!-- Any form: add data-crm-form="Form name". Field names: name, phone, email, message, project, city, budget -->
<form data-crm-form="Enquiry - Hero" data-thank-you="/thank-you">
  <input name="name" placeholder="Name" required>
  <input name="phone" placeholder="Phone" required>
  <input name="email" type="email" placeholder="Email">
  ${project ? `<input type="hidden" name="project" value="${project}">` : '<input name="project" placeholder="Project">'}
  <input name="_hp" style="display:none" tabindex="-1" autocomplete="off"><!-- anti-spam, keep empty -->
  <button type="submit">Submit</button>
</form>`;
  const server = `POST ${endpoint}
Content-Type: application/json

{
  "api_key": "${apiKey}",
  "name": "Dora", "phone": "9299999990", "email": "dora@gmail.com",
  "message": "Interested in 3 BHK", "project": "${project || 'Project name'}",
  "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "summer_sale", "gclid": "Cj0KCQ...",
  "page_url": "https://client-site.com/landing"
}`;
  return { getUrl, script, form, server };
}

function KeyDialog({ open, onOpenChange, editing }) {
  const qc = useQueryClient();
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), enabled: open, staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), enabled: open, staleTime: 60_000 });
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    setF(editing
      ? { name: editing.name, websiteId: String(editing.website_id), assignmentTeamId: String(editing.assignment_team_id || ''), allowedDomains: editing.allowed_domains || '', defaultProject: editing.default_project || '' }
      : { name: '', websiteId: String(websites.data?.find((w) => w.code === 'MPF')?.id || ''), assignmentTeamId: '', allowedDomains: '', defaultProject: '' });
  }, [open, editing, websites.data]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const siteTeams = (teams.data || []).filter((t) => t.is_active !== 0 && (!f.websiteId || !t.website_id || String(t.website_id) === f.websiteId));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, websiteId: Number(f.websiteId), assignmentTeamId: f.assignmentTeamId ? Number(f.assignmentTeamId) : null, allowedDomains: f.allowedDomains, defaultProject: f.defaultProject };
      return editing ? api(`/super-admin/lead-capture-keys/${editing.id}`, { method: 'PATCH', body }) : api('/super-admin/lead-capture-keys', { method: 'POST', body });
    },
    onSuccess: () => { toast.success(editing ? 'Saved' : 'API key created. Open "Integration code" to share it with the client.'); qc.invalidateQueries({ queryKey: KEY }); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit API key' : 'New lead capture API key'}</DialogTitle>
          <DialogDescription>One key per client or landing page. Leads sent with it go into the chosen pipeline.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Client / landing page name"><Input value={f.name || ''} onChange={set('name')} placeholder="Eldeco Terra & Sol – Google Ads LP" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pipeline">
              <Select value={f.websiteId || ''} onChange={(e) => setF((s) => ({ ...s, websiteId: e.target.value, assignmentTeamId: '' }))}>
                <option value="">Select pipeline</option>
                {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </Select>
            </Field>
            <Field label="Assign to team" hint="Empty = system auto-assign setting.">
              <Select value={f.assignmentTeamId || ''} onChange={set('assignmentTeamId')}>
                <option value="">System default</option>
                {siteTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Default project" hint="Used when the form does not send a project."><Input value={f.defaultProject || ''} onChange={set('defaultProject')} placeholder="Eldeco Terra & Sol" /></Field>
          <Field label="Allowed websites (optional)" hint="Comma-separated domains, e.g. eldecoterrasol.com. Empty = any site can use this key."><Input value={f.allowedDomains || ''} onChange={set('allowedDomains')} placeholder="client-site.com, lp.client-site.com" /></Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} disabled={!f.name || f.name.length < 2 || !f.websiteId} onClick={() => save.mutate()}>{editing ? 'Save' : 'Create key'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CodeDialog({ open, onOpenChange, row, endpoint }) {
  const s = useMemo(() => (row ? snippets(endpoint, row.api_key, row.default_project) : null), [row, endpoint]);
  if (!row) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Integration code · {row.name}</DialogTitle>
          <DialogDescription>Send this to the client&apos;s developer. Leads appear in the {row.website_code} pipeline instantly; Google Ads leads are tagged google / cpc via gclid and UTM.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 rounded-md border bg-slate-50 p-3 text-[12.5px]">
            <div className="flex items-center justify-between gap-2"><span className="text-slate-500">API key</span><span className="flex min-w-0 items-center gap-1"><code className="truncate font-mono">{row.api_key}</code><Button size="icon" variant="ghost" onClick={() => copy(row.api_key, 'API key')}><Copy /></Button></span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-slate-500">End point URL</span><span className="flex min-w-0 items-center gap-1"><code className="truncate font-mono">{endpoint}</code><Button size="icon" variant="ghost" onClick={() => copy(endpoint, 'End point')}><Copy /></Button></span></div>
          </div>
          <CodeBlock label="1. Script for the landing page (captures gclid / UTM and sends every form)" code={s.script} />
          <CodeBlock label="2. Form markup example" code={s.form} />
          <CodeBlock label="Quick test / GET URL (Sell.do style)" code={s.getUrl} />
          <CodeBlock label="Server-to-server (JSON POST)" code={s.server} />
          <p className="text-[12px] text-slate-500">Google Ads: keep auto-tagging ON (adds gclid) and use the Final URL suffix <code>utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={'{campaignid}'}</code>. Fields accepted: name, phone, email, message, project, city, budget, form_name, page_url, utm_*, gclid, plus Sell.do style sell_do[form][lead][name|email|phone].</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Lead capture API" section of the Integrations page: public keys for client landing-page forms. */
export function LeadCaptureKeys({ canManage }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: KEY, queryFn: () => api('/admin/lead-capture-keys'), refetchInterval: 60_000 });
  const [dialog, setDialog] = useState(null); // { type: 'edit'|'code', row }
  const patch = useMutation({
    mutationFn: ({ id, body }) => api(`/super-admin/lead-capture-keys/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rotate = useMutation({
    mutationFn: (id) => api(`/super-admin/lead-capture-keys/${id}/rotate`, { method: 'POST' }),
    onSuccess: () => { toast.warning('New key generated. The old key stops working now; send the client the new code.'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/super-admin/lead-capture-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Key deleted'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rows = data?.rows || [];

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-600">Lead capture API (client landing pages)</h2>
          <p className="text-[12px] text-slate-500">Give a client a key; their landing-page forms send leads straight into the CRM, with Google Ads (gclid / UTM) tracking.</p>
        </div>
        {canManage && <Button size="sm" onClick={() => setDialog({ type: 'edit', row: null })}><Plus />New API key</Button>}
      </div>
      <Card className="overflow-x-auto">
        {isLoading ? <Skeleton className="m-3 h-20" /> : !rows.length ? (
          <p className="p-4 text-[13px] text-slate-500">No keys yet. Create one per client / landing page.</p>
        ) : (
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
              <tr><th className="px-3 py-2 font-semibold">Client / landing page</th><th className="px-3 py-2 font-semibold">Pipeline</th><th className="px-3 py-2 font-semibold">API key</th><th className="px-3 py-2 text-right font-semibold">Leads</th><th className="px-3 py-2 font-semibold">Last lead</th><th className="px-3 py-2 font-semibold">Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{r.name}</p>
                    <p className="text-[11.5px] text-slate-500">{[r.default_project, r.team_name && `Team: ${r.team_name}`, r.allowed_domains && `Only: ${r.allowed_domains}`].filter(Boolean).join(' · ') || 'Any website'}</p>
                    {r.last_error && <p className="text-[11.5px] text-red-600">{r.last_error}</p>}
                  </td>
                  <td className="px-3 py-2">{r.website_code}</td>
                  <td className="px-3 py-2"><button className="flex items-center gap-1 font-mono text-[12px] text-slate-700 hover:text-[hsl(var(--primary))]" onClick={() => copy(r.api_key, 'API key')} title="Copy">{r.api_key.slice(0, 10)}…<Copy className="h-3 w-3" /></button></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.leads_count}</td>
                  <td className="px-3 py-2 text-slate-600">{r.last_used_at ? <span title={formatDateTime(r.last_used_at)}>{timeAgo(r.last_used_at)}</span> : 'Never'}</td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <button onClick={() => patch.mutate({ id: r.id, body: { isActive: !r.is_active } })} className={r.is_active ? 'font-medium text-emerald-700' : 'font-medium text-slate-400'}>{r.is_active ? 'Active' : 'Disabled'}</button>
                    ) : <span className={r.is_active ? 'text-emerald-700' : 'text-slate-400'}>{r.is_active ? 'Active' : 'Disabled'}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'code', row: r })}><Code2 />Integration code</Button>
                    {canManage && (
                      <>
                        <Button size="icon" variant="ghost" title="Edit" onClick={() => setDialog({ type: 'edit', row: r })}><Pencil /></Button>
                        <Button size="icon" variant="ghost" title="New key" onClick={() => confirmAction({ title: `Generate a new key for “${r.name}”?`, description: 'The current key stops working immediately. Update every form that uses it.', confirmText: 'Generate new key', tone: 'warning', icon: 'key' }, () => rotate.mutate(r.id))}><KeyRound /></Button>
                        <Button size="icon" variant="ghost" title="Delete" className="text-red-600 hover:bg-red-50" onClick={() => confirmAction({ title: `Delete the key for “${r.name}”?`, description: 'Its forms stop sending leads. Leads already in the CRM stay.', confirmText: 'Delete key', tone: 'danger' }, () => remove.mutate(r.id))}><Trash2 /></Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {data?.endpoint && <p className="mt-1.5 flex items-center gap-1 text-[12px] text-slate-500"><Link2 className="h-3.5 w-3.5" />End point: <code className="font-mono">{data.endpoint}</code></p>}
      <KeyDialog open={dialog?.type === 'edit'} onOpenChange={(o) => !o && setDialog(null)} editing={dialog?.row} />
      <CodeDialog open={dialog?.type === 'code'} onOpenChange={(o) => !o && setDialog(null)} row={dialog?.row} endpoint={data?.endpoint} />
    </section>
  );
}
