# Connecting MPF, RMW and CT to the CRM

Each website keeps its own lead system exactly as it is. After a lead is saved there, the website also sends a copy to the CRM. If the CRM is down, the website is unaffected: the push is fire-and-forget with a timeout.

## 1. Generate a key per website

Super Admin → **Integrations** → *Generate key*, or from the CLI:

```bash
cd backend
npm run integration:key -- MPF          # add --signed to require HMAC signatures
npm run integration:key -- RMW
npm run integration:key -- CT
```

The key and HMAC secret are shown **once**. The CRM stores only a SHA-256 hash of the key and an AES-GCM-encrypted HMAC secret.

## 2. Endpoint contract

```
POST https://<crm-api>/api/integrations/<mpf|rmw|ct>/leads
Content-Type: application/json
Authorization: Bearer <api key>        (or X-CRM-Key: <api key>; MPF's existing x-mpf-crm-key header also works)
Idempotency-Key: <optional, e.g. rmw-88321>
X-CRM-Timestamp: <unix seconds>        (only when signatures are required)
X-CRM-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
```

Responses:
- `202 {"success":true,"data":{"eventId":..,"externalLeadId":"RMW-88321","duplicate":false}}`: accepted and queued.
- `200` with `duplicate:true`: an identical payload was already received. Safe to ignore.
- `400`: payload invalid (for example, a missing source id). Not retried.
- `401`: bad key or signature.

The CRM never overwrites the external ID or existing attribution. A re-sent lead with the same source ID only fills empty fields.

**Backfill:** `POST /api/integrations/<site>/leads/batch` with `{"leads":[...]}` (up to 500 per call), in the same per-site format.

Optional attribution fields, accepted from every site at the top level or inside `utm` / `attribution`: `utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, msclkid, referrer, landing_page, page_name`.

---

## MPF: no code change needed

`mpf-backend` already contains `CrmIntegrationService.pushEnquiry()`. It runs after every enquiry save and sends `externalId`, contact fields, and `metadata` with the full UTM, device, geo and journey data. Set these in the MPF backend environment and restart it:

```env
CRM_WEBHOOK_URL=https://<crm-api>/api/integrations/mpf/leads
MPF_CRM_WEBHOOK_KEY=<MPF api key from step 1>
```

Recommended follow-up on the MPF side (not required): configure a RestTemplate timeout in `CrmIntegrationService`. It currently has none.

## RMW: add one non-blocking call

File: `rmw-backend/src/app/api/system-settings/contact-enquiry/route.ts`, directly after the `INSERT INTO enquiries ...` query.

```ts
// Capture the result of the existing insert:
// const [insertResult]: any = await db.query("INSERT INTO enquiries (...) VALUES (...)", [...]);
const insertId = insertResult?.insertId;

if (insertId && process.env.CRM_WEBHOOK_URL && process.env.CRM_WEBHOOK_KEY) {
  // Fire-and-forget: never blocks or fails the enquiry response.
  fetch(process.env.CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRM_WEBHOOK_KEY}`,
      'Idempotency-Key': `rmw-${insertId}`,
    },
    body: JSON.stringify({
      id: insertId, etype, name, email, mobile, message, category, resume: resumePath ?? null,
      send_date: new Date().toISOString(),
      // When the site starts capturing attribution, pass it through here:
      // utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, referrer, landing_page,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.error('CRM push failed:', err?.message));
}
```

```env
CRM_WEBHOOK_URL=https://<crm-api>/api/integrations/rmw/leads
CRM_WEBHOOK_KEY=<RMW api key>
```

Use the variable names the route already has for these fields. The RMW adapter also parses "Reason for Inquiry", "Country" and "How did you hear about us" out of the message that new-rmw builds.

**Gaps to fix on the RMW side (separately):**
- The new-rmw "Start a project / audit" form (`/api/audit`) does not save or forward leads anywhere today.
- No UTM, referrer or landing page is captured. Adding a small first-touch tracker like MPF's `leadTracker` and passing the fields through `/api/contact` would give full attribution.

## CT: add one non-blocking call

File: `contenaissance/app/api/enquiry/route.ts`, inside the `if (!existing)` block, right after the `INSERT INTO leads ...` query. **Deploy it to production `www.contenaissance.com`**, because the contact and sidebar forms proxy there.

```ts
// const result: any = await query("INSERT INTO leads (...) VALUES (...)", [...]);
const insertId = result?.insertId;

if (insertId && process.env.CRM_WEBHOOK_URL && process.env.CRM_WEBHOOK_KEY) {
  fetch(process.env.CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CRM_WEBHOOK_KEY}`,
      'Idempotency-Key': `ct-${insertId}`,
    },
    body: JSON.stringify({
      id: insertId, type, full_name: fullName, email, phone: contactNumber, service: subject, message, source,
      created_at: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  }).catch((err) => console.error('CRM push failed:', err?.message));
}
```

```env
CRM_WEBHOOK_URL=https://<crm-api>/api/integrations/ct/leads
CRM_WEBHOOK_KEY=<CT api key>
```

## Optional: HMAC signing (Node)

```js
import crypto from 'node:crypto';
const body = JSON.stringify(payload);
const ts = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac('sha256', process.env.CRM_WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex');
// headers: { 'X-CRM-Timestamp': String(ts), 'X-CRM-Signature': `sha256=${sig}` }
```

## Monitoring

Admin / Super Admin → **Integrations** shows, per website: last received, last success, 24-hour volume, pending and failed events, and the last error. Failed events can be retried individually. With Redis configured, BullMQ retries transient failures automatically (5 attempts, exponential backoff).
