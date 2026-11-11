import fs from 'node:fs';
import { env } from '../config/env.js';

const base = env.MPF_API_URL.replace(/\/$/, '');
const out = process.argv[2] || 'mpf-enquiries.json';
const login = await fetch(`${base}/admin-portal/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.MPF_ADMIN_EMAIL, password: env.MPF_ADMIN_PASSWORD }),
});
const auth = await login.json().catch(() => ({}));
if (!login.ok || !auth.token) { console.error(`MPF login failed (${login.status}) ${auth.message || ''}`); process.exit(1); }
const res = await fetch(`${base}/enquiry/get-all`, { headers: { Authorization: `Bearer ${auth.token}`, cookie: `token=${auth.token}` } });
if (!res.ok) { console.error(`get-all failed (${res.status})`); process.exit(1); }
const body = await res.json();
const rows = Array.isArray(body) ? body : body?.data || [];
fs.writeFileSync(out, JSON.stringify(rows, null, 2));
const dates = rows.map((r) => r.createdAt || r.created_at || r.date).filter(Boolean).sort();
console.log(JSON.stringify({ count: rows.length, file: out, oldest: dates[0], newest: dates.at(-1), fields: Object.keys(rows[0] || {}) }));
