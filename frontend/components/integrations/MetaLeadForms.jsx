'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Plus, Trash2, Pencil, KeyRound, Upload, Wand2, Workflow, ClipboardPaste, ExternalLink, FlaskConical, Columns3 } from 'lucide-react';
import { api, apiMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/feedback';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MetaMark } from '@/components/integrations/MetaLogo';

/**
 * "Client Meta lead forms" section of the Integrations page. For clients who will NOT share Page access: they register
 * a form (the Campaign Detail + Fields Level Mapping sheet), and their own middleware pushes each lead to the form's URL.
 */
const KEY = ['meta-forms'];
const IMPORT_CHUNK = 100;
const TESTING_TOOL = 'https://developers.facebook.com/tools/lead-ads-testing';

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); } catch { toast.error('Copy failed; select and copy manually'); }
}
const snake = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_?]+/g, '_').replace(/^_+|_+$/g, '');

/* ── Sheet paste: the client's Excel ("Campaign Detail" + "Fields Level Mapping") copied as text ───────────── */

const DETAIL_LABELS = { integration_type: 'integrationType', campaign_type: 'campaignType', project_name: 'projectName', form_name: 'formName', form_id: 'formId' };
const CONST_TARGETS = new Set(['enquiry_source', 'enquiry_sub_source', 'project']);

/** Excel copy = tab-separated rows. Returns { details, fieldMap, notes }. Pure. */
export function parseSheet(text, targets, knownKeys) {
  const details = {};
  const fieldMap = {};
  const notes = [];
  const bySfdc = Object.fromEntries(targets.filter((t) => t.sfdc).map((t) => [t.sfdc.toLowerCase(), t]));
  const known = new Set(knownKeys);
  for (const line of String(text || '').split(/\r?\n/)) {
    const cells = line.split('\t').map((c) => c.trim()).filter((c) => c && !/^\d{1,3}$/.test(c)); // drop S.No
    if (!cells.length) continue;
    const label = snake(cells[0]);
    if (DETAIL_LABELS[label]) {
      const v = cells.slice(1).join(' ').trim();
      if (v) details[DETAIL_LABELS[label]] = label === 'form_id' ? v.replace(/\D/g, '') : v;
      continue;
    }
    const t = bySfdc[cells[0].toLowerCase()];
    if (!t) continue;
    const vendor = cells[1];
    if (!vendor || vendor.toLowerCase() === t.sfdc.toLowerCase()) { if (t.key === 'project') fieldMap.project = null; continue; } // blank / echoes the API name: keep default
    const k = snake(vendor);
    if (CONST_TARGETS.has(t.key)) fieldMap[t.key] = `const:${vendor}`;
    else if (known.has(k)) fieldMap[t.key] = `field:${k}`;
    else if (known.has(k.replace(/^ad_set/, 'adset'))) fieldMap[t.key] = `field:${k.replace(/^ad_set/, 'adset')}`;
    else { fieldMap[t.key] = `field:${k}`; notes.push(`${t.sfdc} ← "${vendor}" (will match the form question "${k}")`); }
  }
  if (details.integrationType) details.integrationType = /direct/i.test(details.integrationType) && !/middle/i.test(details.integrationType) ? 'DIRECT' : 'MIDDLEWARE';
  return { details, fieldMap, notes };
}

/* ── Register / edit ─────────────────────────────────────────────────────────────────────────────────────── */

function FormDialog({ open, onOpenChange, editing, meta }) {
  const qc = useQueryClient();
  const websites = useQuery({ queryKey: ['admin', 'websites'], queryFn: () => api('/admin/websites'), enabled: open, staleTime: 60_000 });
  const teams = useQuery({ queryKey: ['admin', 'teams'], queryFn: () => api('/admin/teams'), enabled: open, staleTime: 60_000 });
  const [f, setF] = useState({});
  const [paste, setPaste] = useState('');
  const [pasted, setPasted] = useState(null);
  useEffect(() => {
    if (!open) return;
    setPaste(''); setPasted(null);
    setF(editing
      ? { clientName: editing.client_name, formId: editing.form_id, formName: editing.form_name, projectName: editing.project_name || '', campaignType: editing.campaign_type || '',
        integrationType: editing.integration_type || 'MIDDLEWARE', websiteId: String(editing.website_id), assignmentTeamId: String(editing.assignment_team_id || '') }
      : { clientName: '', formId: '', formName: '', projectName: '', campaignType: 'Facebook Campaign', integrationType: 'MIDDLEWARE', websiteId: '', assignmentTeamId: '' });
  }, [open, editing]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const siteTeams = (teams.data || []).filter((t) => t.is_active !== 0 && (!f.websiteId || !t.website_id || String(t.website_id) === f.websiteId));

  const applyPaste = () => {
    const r = parseSheet(paste, meta.targets, [...meta.standardQuestions, ...meta.metaAttributes]);
    if (!Object.keys(r.details).length && !Object.keys(r.fieldMap).length) { toast.error('Nothing recognised. Copy the whole sheet from Excel (both tables) and paste it here.'); return; }
    setF((s) => ({ ...s, ...r.details, clientName: s.clientName || (r.details.projectName || '').split(/\s+/)[0] || '' }));
    setPasted(r);
    toast.success(`Filled ${Object.keys(r.details).length} details and ${Object.keys(r.fieldMap).length} field mappings from the sheet`);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { clientName: (f.clientName || f.projectName).trim(), formId: f.formId.replace(/\D/g, ''), formName: f.formName, projectName: f.projectName, campaignType: f.campaignType,
        integrationType: f.integrationType, websiteId: Number(f.websiteId), assignmentTeamId: f.assignmentTeamId ? Number(f.assignmentTeamId) : null };
      if (pasted) {
        const fm = { ...pasted.fieldMap };
        if (!fm.project && f.projectName) fm.project = `const:${f.projectName}`;
        body.fieldMap = Object.fromEntries(Object.entries(fm).filter(([, v]) => v));
      }
      return editing ? api(`/super-admin/meta-forms/${editing.id}`, { method: 'PATCH', body }) : api('/super-admin/meta-forms', { method: 'POST', body });
    },
    onSuccess: () => { toast.success(editing ? 'Saved' : 'Form registered. Open "Setup" to send the client their push URL.'); qc.invalidateQueries({ queryKey: KEY }); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  // Pipeline is easy to miss: preselect the first one.
  useEffect(() => {
    if (open && !editing && websites.data?.length) setF((s) => (s.websiteId ? s : { ...s, websiteId: String(websites.data[0].id) }));
  }, [open, editing, websites.data]);

  // Say what is missing instead of a silently disabled button.
  const submit = () => {
    const missing = [];
    if ((f.clientName || f.projectName || '').trim().length < 2) missing.push('Client name');
    if (!/^\d{5,32}$/.test((f.formId || '').replace(/\D/g, ''))) missing.push('Form id (numbers only)');
    if (!f.formName?.trim()) missing.push('Form name');
    if (!f.websiteId) missing.push('Pipeline');
    if (missing.length) { toast.error(`Fill in: ${missing.join(', ')}`); return; }
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Meta form' : 'Register Meta form'}</DialogTitle>
          <DialogDescription className="sr-only">Client Meta lead form details</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {!editing && (
            <div>
              <Textarea rows={2} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste client's Excel sheet here (optional)" className="font-mono text-[11.5px]" />
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[11.5px] text-slate-500">{pasted ? `${Object.keys(pasted.fieldMap).length} mappings filled` : ''}</p>
                <Button size="sm" variant="outline" disabled={!paste.trim()} onClick={applyPaste}><ClipboardPaste />Fill from sheet</Button>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client name"><Input value={f.clientName || ''} onChange={set('clientName')} placeholder="M3M" /></Field>
            <Field label="Project name"><Input value={f.projectName || ''} onChange={set('projectName')} placeholder="M3M Crown Leadgen" /></Field>
            <Field label="Form name"><Input value={f.formName || ''} onChange={set('formName')} placeholder="IC_m3mcrown_leadgen_13oct25_" /></Field>
            <Field label="Form id"><Input value={f.formId || ''} onChange={set('formId')} inputMode="numeric" placeholder="801811845786683" /></Field>
            <Field label="Campaign type"><Input value={f.campaignType || ''} onChange={set('campaignType')} placeholder="Facebook Campaign" /></Field>
            <Field label="Integration type">
              <Select value={f.integrationType || 'MIDDLEWARE'} onChange={set('integrationType')}>
                <option value="MIDDLEWARE">Middleware</option>
                <option value="DIRECT">Direct</option>
              </Select>
            </Field>
            <Field label="Pipeline">
              <Select value={f.websiteId || ''} onChange={(e) => setF((s) => ({ ...s, websiteId: e.target.value, assignmentTeamId: '' }))}>
                <option value="">Select pipeline</option>
                {(websites.data || []).map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
              </Select>
            </Field>
            <Field label="Assign to team">
              <Select value={f.assignmentTeamId || ''} onChange={set('assignmentTeamId')}>
                <option value="">System default</option>
                {siteTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{editing ? 'Save' : 'Register'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Field mapping ───────────────────────────────────────────────────────────────────────────────────────── */

function MappingDialog({ open, onOpenChange, row, meta }) {
  const qc = useQueryClient();
  const [map, setMap] = useState({});
  // Keyed on the id: the list refetches every 30s and must not wipe a mapping being edited.
  useEffect(() => { if (open && row) setMap(row.field_map || {}); }, [open, row?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const detected = row?.detected_fields || [];
  const attrs = new Set(meta.metaAttributes);
  const questions = (detected.length ? detected.filter((k) => !attrs.has(k) && !['leadgen_id', 'lead_id'].includes(k)) : meta.standardQuestions);
  const adInfo = detected.length ? detected.filter((k) => attrs.has(k)) : meta.metaAttributes;
  const suggest = useMutation({
    mutationFn: () => api(`/super-admin/meta-forms/${row.id}/suggest`),
    onSuccess: (r) => { setMap(r.fieldMap); toast.success('Mapped automatically. Check and save.'); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const save = useMutation({
    mutationFn: () => api(`/super-admin/meta-forms/${row.id}`, { method: 'PATCH', body: { fieldMap: Object.fromEntries(Object.entries(map).filter(([, v]) => v && v !== 'const:')) } }),
    onSuccess: () => { toast.success('Mapping saved. New leads use it immediately.'); qc.invalidateQueries({ queryKey: KEY }); onOpenChange(false); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  if (!row) return null;
  const kind = (v) => (!v ? '' : v.startsWith('const:') ? 'const' : v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Field mapping · {row.form_name}</DialogTitle>
          <DialogDescription>Which value of the Meta lead fills each CRM field. Answers left unmapped are kept in the lead&apos;s note.</DialogDescription>
        </DialogHeader>
        <div className={`flex items-start gap-2 rounded-md border p-2.5 text-[12px] ${detected.length ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
          {detected.length
            ? <span>{detected.length} fields detected from leads this form has sent. The dropdowns show this form&apos;s exact field names.</span>
            : <span>No lead received yet, so the dropdowns show Meta&apos;s standard fields. Ask the client to send one lead through their middleware (the <a className="underline" href={TESTING_TOOL} target="_blank" rel="noreferrer">Lead Ads Testing Tool</a> works; test leads only teach fields, they are not saved). Then reopen this and press Auto-map.</span>}
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-white text-left text-[12px] text-slate-500"><tr><th className="py-1.5 font-semibold">CRM field</th><th className="py-1.5 font-semibold">Comes from</th></tr></thead>
            <tbody>
              {meta.targets.map((t) => {
                const v = map[t.key] || '';
                const k = kind(v);
                const fieldKey = k && k !== 'const' ? v.slice(6) : null;
                const missing = fieldKey && detected.length && !detected.includes(fieldKey);
                return (
                  <tr key={t.key} className="border-t">
                    <td className="py-1.5 pr-3 align-top">
                      <p className="font-medium text-slate-800">{t.label}</p>
                      {t.sfdc && <p className="font-mono text-[11px] text-slate-400">{t.sfdc}</p>}
                    </td>
                    <td className="py-1.5">
                      <div className="flex gap-2">
                        <Select value={k} onChange={(e) => setMap((s) => ({ ...s, [t.key]: e.target.value === 'const' ? 'const:' : e.target.value }))} className="min-w-0 flex-1">
                          <option value="">Not mapped</option>
                          {fieldKey && !questions.includes(fieldKey) && !adInfo.includes(fieldKey) && <option value={v}>{fieldKey}{missing ? ' (not received yet)' : ''}</option>}
                          <optgroup label="Form answers">{questions.map((q) => <option key={q} value={`field:${q}`}>{q}</option>)}</optgroup>
                          <optgroup label="Ad / lead info">{adInfo.map((q) => <option key={q} value={`field:${q}`}>{q}</option>)}</optgroup>
                          <option value="const">Fixed value…</option>
                        </Select>
                        {k === 'const' && <Input className="flex-1" value={v.slice(6)} onChange={(e) => setMap((s) => ({ ...s, [t.key]: `const:${e.target.value}` }))} placeholder={t.key === 'project' ? row.project_name || 'Project' : 'Value'} />}
                      </div>
                      {missing && <p className="mt-0.5 text-[11px] text-amber-700">This form has not sent &quot;{fieldKey}&quot; yet.</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter>
          <Button variant="outline" loading={suggest.isPending} onClick={() => suggest.mutate()}><Wand2 />Auto-map</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save mapping</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Setup guide for the client ──────────────────────────────────────────────────────────────────────────── */

function Code({ label, code }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-slate-700">{label}</p>
        <Button size="sm" variant="ghost" onClick={() => copy(code, label)}><Copy />Copy</Button>
      </div>
      <pre className="max-h-56 overflow-auto rounded-md border bg-slate-950 p-3 text-[11.5px] leading-relaxed text-slate-100"><code>{code}</code></pre>
    </div>
  );
}

function SetupDialog({ open, onOpenChange, row }) {
  if (!row) return null;
  const url = row.push_url;
  const sample = JSON.stringify({
    id: '{{Lead ID}}', created_time: '{{Created Time}}', form_id: row.form_id,
    campaign_name: '{{Campaign Name}}', adset_name: '{{Ad Set Name}}', ad_name: '{{Ad Name}}', platform: '{{Platform}}',
    first_name: '{{First Name}}', last_name: '{{Last Name}}', full_name: '{{Full Name}}', phone_number: '{{Phone Number}}', email: '{{Email}}',
  }, null, 2);
  const curl = `curl -X POST "${url}" -H "Content-Type: application/json" -d '{"id":"<test lead>","form_id":"${row.form_id}","full_name":"<test lead: dummy data for full_name>","phone_number":"<test lead: dummy data for phone_number>"}'`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Client setup · {row.form_name}</DialogTitle>
          <DialogDescription>Send this to the client. Their Page stays with them: they forward leads of form {row.form_id} from their own account.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="rounded-md border bg-slate-50 p-3 text-[12.5px]">
            <p className="mb-1 text-slate-500">Push URL for this form (keep it private, it works like a password)</p>
            <div className="flex items-center gap-1"><code className="min-w-0 flex-1 break-all font-mono">{url}</code><Button size="icon" variant="ghost" onClick={() => copy(url, 'Push URL')}><Copy /></Button></div>
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-slate-700">
            <li>In <b>Zapier</b>, <b>Make</b>, <b>Pabbly Connect</b> or <b>LeadsBridge</b>, create a flow with trigger <b>Facebook Lead Ads → New Lead</b>, pick their Page and the form <b>{row.form_name}</b>.</li>
            <li>Add the action <b>Webhooks → POST</b> (Zapier: &quot;Webhooks by Zapier&quot;, Make: &quot;HTTP → Make a request&quot;) to the push URL above, body type <b>JSON</b>.</li>
            <li>Send all lead fields. The easiest way is to pass the whole lead; otherwise map the fields like the example below. Any extra questions are welcome; we map them here.</li>
            <li>Test with Meta&apos;s <a className="text-[hsl(var(--primary))] underline" href={TESTING_TOOL} target="_blank" rel="noreferrer">Lead Ads Testing Tool <ExternalLink className="inline h-3 w-3" /></a>. Test leads are not saved; they show us the form&apos;s fields so we can finish the mapping.</li>
            <li>Turn the flow on. Every new lead appears in the CRM under <b>Client Leads → {row.client_name}</b> within seconds.</li>
          </ol>
          <Code label="Example JSON body (field names may be anything; we map them)" code={sample} />
          <Code label="Quick test from a terminal (sends a test lead)" code={curl} />
          <p className="text-[12px] text-slate-500">Also accepted: Meta&apos;s Graph lead format (<code>field_data</code>), form-encoded bodies, query strings, an array of up to 100 leads, or the key in an <code>X-Api-Key</code> header to <code>/api/public/meta-form-leads</code>. Leads are de-duplicated on the Meta lead id, so retries are safe. Leads from any other form are refused.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── CSV import (Meta Leads Center / Ads Manager download) ───────────────────────────────────────────────── */

/** Meta downloads are UTF-16LE tab-separated; manual exports are UTF-8 CSV. Returns array of row objects. */
export function parseDelimited(buf) {
  const bytes = new Uint8Array(buf);
  const text = bytes[0] === 0xff && bytes[1] === 0xfe ? new TextDecoder('utf-16le').decode(buf)
    : bytes[0] === 0xfe && bytes[1] === 0xff ? new TextDecoder('utf-16be').decode(buf) : new TextDecoder('utf-8').decode(buf);
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n'));
  const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i += 1; row.push(cell); cell = ''; if (row.some((c) => c !== '')) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some((c) => c !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()]).filter(([h, v]) => h && v !== '')));
}

function ImportDialog({ open, onOpenChange, row }) {
  const qc = useQueryClient();
  const input = useRef(null);
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(null);
  useEffect(() => { if (open) { setRows(null); setFileName(''); setProgress(null); } }, [open]);
  const preview = useMemo(() => {
    if (!rows || !row) return null;
    const formOf = (r) => String(r.form_id || r['Form ID'] || '').replace(/^f:/, '');
    const other = rows.filter((r) => formOf(r) && formOf(r) !== row.form_id).length;
    return { total: rows.length, other, columns: Object.keys(rows[0] || {}).slice(0, 12) };
  }, [rows, row]);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('File is larger than 20 MB'); return; }
    try {
      const parsed = parseDelimited(await file.arrayBuffer());
      if (!parsed.length) { toast.error('No rows found in the file'); return; }
      setRows(parsed); setFileName(file.name);
    } catch { toast.error('Could not read the file. Use the CSV downloaded from Meta Leads Center or Ads Manager.'); }
  };

  const run = async () => {
    const total = { created: 0, updated: 0, tests: 0, skippedOtherForm: 0, failed: 0, errors: [] };
    setProgress({ done: 0, total: rows.length, ...total });
    try {
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const r = await api(`/super-admin/meta-forms/${row.id}/import`, { method: 'POST', body: { rows: rows.slice(i, i + IMPORT_CHUNK) } });
        ['created', 'updated', 'tests', 'skippedOtherForm', 'failed'].forEach((k) => { total[k] += r[k] || 0; });
        total.errors = [...total.errors, ...(r.errors || [])].slice(0, 5);
        setProgress({ done: Math.min(i + IMPORT_CHUNK, rows.length), total: rows.length, ...total });
      }
      toast.success(`Import finished: ${total.created} new, ${total.updated} already in the CRM`);
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) { toast.error(apiMessage(e)); }
  };
  if (!row) return null;
  const running = progress && progress.done < progress.total;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import leads · {row.form_name}</DialogTitle>
          <DialogDescription>For older leads, or a client without middleware: they download the form&apos;s leads from Meta Leads Center (or Ads Manager → Download leads) and send you the file.</DialogDescription>
        </DialogHeader>
        <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={pick} />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={running}><Upload />{fileName || 'Choose CSV file'}</Button>
        {preview && (
          <div className="rounded-md border bg-slate-50 p-3 text-[12.5px] text-slate-700">
            <p><b>{preview.total}</b> rows · columns: <span className="font-mono text-[11.5px]">{preview.columns.join(', ')}{preview.columns.length === 12 ? '…' : ''}</span></p>
            {preview.other > 0 && <p className="text-amber-700">{preview.other} rows belong to another form and will be skipped.</p>}
            <p className="mt-1 text-slate-500">Uses this form&apos;s field mapping. Leads already in the CRM are updated, not duplicated. No notifications are sent for imported leads.</p>
          </div>
        )}
        {progress && (
          <div className="space-y-1 text-[12.5px]">
            <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            <p>{progress.done}/{progress.total} · {progress.created} new · {progress.updated} existing · {progress.skippedOtherForm} other form · {progress.tests} test · <span className={progress.failed ? 'text-red-600' : ''}>{progress.failed} failed</span></p>
            {progress.errors.map((e) => <p key={e} className="text-[11.5px] text-red-600">{e}</p>)}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>Close</Button>
          <Button loading={running} disabled={!rows || running || (progress && progress.done === progress.total)} onClick={run}>Import {rows ? rows.length : ''} leads</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Section ─────────────────────────────────────────────────────────────────────────────────────────────── */

function status(r) {
  if (!r.is_active) return { text: 'Disabled', cls: 'text-slate-400' };
  if (r.last_error && (!r.last_lead_at || new Date(r.last_error_at) > new Date(r.last_lead_at))) return { text: 'Needs attention', cls: 'text-red-600' };
  if (r.last_lead_at) return { text: 'Receiving', cls: 'text-emerald-700' };
  if (r.last_test_at || r.detected_fields?.length) return { text: 'Test received', cls: 'text-sky-700' };
  return { text: 'Waiting for first lead', cls: 'text-amber-700' };
}

export function MetaLeadForms({ canManage }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: KEY, queryFn: () => api('/admin/meta-forms'), refetchInterval: 30_000 });
  const [dialog, setDialog] = useState(null); // { type: 'edit'|'map'|'setup'|'import', row }
  const meta = { targets: data?.targets || [], metaAttributes: data?.metaAttributes || [], standardQuestions: data?.standardQuestions || [] };
  const patch = useMutation({
    mutationFn: ({ id, body }) => api(`/super-admin/meta-forms/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rotate = useMutation({
    mutationFn: (id) => api(`/super-admin/meta-forms/${id}/rotate`, { method: 'POST' }),
    onSuccess: () => { toast.warning('New URL generated. The old URL stops working now; send the client the new one.'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id) => api(`/super-admin/meta-forms/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Form removed'); qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rows = data?.rows || [];
  const fresh = (r) => rows.find((x) => x.id === r?.id) || r; // dialogs see refetched data

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-slate-600"><MetaMark />Meta lead forms</h2>
        {canManage && <Button size="sm" onClick={() => setDialog({ type: 'edit', row: null })}><Plus />Register form</Button>}
      </div>
      <Card className="overflow-x-auto">
        {isLoading ? <Skeleton className="m-3 h-20" /> : isError ? (
          <p className="p-4 text-[13px] text-red-600">Could not load forms: {apiMessage(error)}</p>
        ) : !rows.length ? (
          <p className="p-4 text-[13px] text-slate-500">No forms yet.</p>
        ) : (
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
              <tr><th className="px-3 py-2 font-semibold">Client / form</th><th className="px-3 py-2 font-semibold">Project</th><th className="px-3 py-2 font-semibold">Pipeline</th><th className="px-3 py-2 text-right font-semibold">Fields</th><th className="px-3 py-2 text-right font-semibold">Leads</th><th className="px-3 py-2 font-semibold">Last lead</th><th className="px-3 py-2 font-semibold">Status</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = status(r);
                return (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{r.client_name} · <span className="font-normal">{r.form_name}</span></p>
                      <p className="font-mono text-[11.5px] text-slate-500">Form {r.form_id} · {r.integration_type === 'DIRECT' ? 'Direct' : 'Middleware'}{r.team_name ? ` · Team: ${r.team_name}` : ''}</p>
                      {r.last_error && s.text === 'Needs attention' && <p className="text-[11.5px] text-red-600" title={formatDateTime(r.last_error_at)}>{r.last_error}</p>}
                    </td>
                    <td className="px-3 py-2">{r.project_name || <span className="text-slate-400">—</span>}</td>
                    <td className="px-3 py-2">{r.website_code}</td>
                    <td className="px-3 py-2 text-right tabular-nums" title={r.detected_fields.join(', ')}>{Object.keys(r.field_map || {}).length} mapped{r.detected_fields.length ? ` / ${r.detected_fields.length} seen` : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.leads_count ? <Link className="text-[hsl(var(--primary))] hover:underline" href={`/crm/client-leads?clientName=${encodeURIComponent(r.client_name)}`}>{r.leads_count}</Link> : 0}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.last_lead_at ? <span title={formatDateTime(r.last_lead_at)}>{timeAgo(r.last_lead_at)}</span> : 'Never'}</td>
                    <td className="px-3 py-2">
                      {canManage
                        ? <button onClick={() => patch.mutate({ id: r.id, body: { isActive: !r.is_active } })} className={`font-medium ${s.cls}`} title={r.is_active ? 'Click to disable' : 'Click to enable'}>{s.text}</button>
                        : <span className={s.cls}>{s.text}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setDialog({ type: 'setup', row: r })}><Workflow />Setup</Button>
                      {canManage && (
                        <>
                          <Button size="icon" variant="ghost" title="Field mapping" onClick={() => setDialog({ type: 'map', row: r })}><Columns3 /></Button>
                          <Button size="icon" variant="ghost" title="Import CSV" onClick={() => setDialog({ type: 'import', row: r })}><Upload /></Button>
                          <Button size="icon" variant="ghost" title="Edit" onClick={() => setDialog({ type: 'edit', row: r })}><Pencil /></Button>
                          <Button size="icon" variant="ghost" title="New URL" onClick={() => { if (window.confirm(`Generate a new push URL for "${r.form_name}"? The current URL stops working immediately.`)) rotate.mutate(r.id); }}><KeyRound /></Button>
                          <Button size="icon" variant="ghost" title="Remove" className="text-red-600 hover:bg-red-50" onClick={() => { if (window.confirm(`Remove "${r.form_name}"? Its URL stops accepting leads. Existing leads stay.`)) remove.mutate(r.id); }}><Trash2 /></Button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      <FormDialog open={dialog?.type === 'edit'} onOpenChange={(o) => !o && setDialog(null)} editing={dialog?.row} meta={meta} />
      {data && <MappingDialog open={dialog?.type === 'map'} onOpenChange={(o) => !o && setDialog(null)} row={fresh(dialog?.row)} meta={meta} />}
      <SetupDialog open={dialog?.type === 'setup'} onOpenChange={(o) => !o && setDialog(null)} row={fresh(dialog?.row)} />
      <ImportDialog open={dialog?.type === 'import'} onOpenChange={(o) => !o && setDialog(null)} row={fresh(dialog?.row)} />
    </section>
  );
}
