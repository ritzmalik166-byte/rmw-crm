# Meta (Facebook + Instagram) Lead Ads integration

Leads submitted on Meta Lead Ad forms arrive in the CRM in real time, go through the same pipeline as website
leads (duplicate detection, auto-assignment, notifications, timeline), and keep full campaign attribution.

```
Meta Lead Form → Meta webhook → POST /api/integrations/meta/webhook (signature checked, stored, queued)
  → worker fetches the lead from the Graph API with the Page token → normalise → upsertCanonicalLead()
  → duplicate check → assignment → lead + activity + notifications
Fallback: "Sync now" (and SYNC_INTERVAL_MINUTES) pulls recent leads per form and imports anything missed.
```

## 1. Meta developer app

1. https://developers.facebook.com → **Create app** → type **Business**. Attach it to the Business portfolio that owns the Page and ad account.
2. **Add products**: *Facebook Login for Business* (or *Facebook Login*) and *Webhooks*.
3. **App settings → Basic**: copy **App ID** and **App secret** → `META_APP_ID`, `META_APP_SECRET`. Add the CRM domain to *App domains* and a Privacy Policy URL.
4. **App settings → Advanced**: turn on **Require app secret** (the CRM signs every call with `appsecret_proof`).
5. **Facebook Login → Settings → Valid OAuth Redirect URIs**: add exactly the value of `META_REDIRECT_URI`, e.g.
   `https://crm.example.com/api/integrations/meta/oauth/callback`
   It must be on the **CRM web origin** (the same host users sign in on) so the session cookie is sent back.

### Permissions (Advanced Access via App Review for production)

| Permission | Used for |
|---|---|
| `pages_show_list`, `pages_read_engagement` | list the Pages the user manages |
| `pages_manage_metadata` | subscribe the Page to the leadgen webhook |
| `pages_manage_ads`, `leads_retrieval` | read lead forms and lead data |
| `ads_read` | campaign / ad set / ad names and spend (cost per lead) |
| `business_management` | list Business portfolios |

While the app is in Development mode only people with a role on the app can connect. The connecting person needs a
Page role that can manage leads, and **CRM access** must be granted to the app in
*Page → Settings → Lead access* (Meta Business Suite) if lead access is restricted.

## 2. Webhook

1. Set `META_WEBHOOK_VERIFY_TOKEN` to a long random string and restart the API.
2. App dashboard → **Webhooks** → object **Page** → *Subscribe to this object*:
   - Callback URL: `https://crm.example.com/api/integrations/meta/webhook`
   - Verify token: the same `META_WEBHOOK_VERIFY_TOKEN`
3. Subscribe to the **leadgen** field.
4. The Page-level subscription is done by the CRM when you click **Save connection** (and is removed on Disconnect).

The endpoint must be reachable over HTTPS from the internet. Requests are rejected unless
`X-Hub-Signature-256` matches an HMAC-SHA256 of the raw body with the app secret.

## 3. Environment (backend/.env)

```
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=https://crm.example.com/api/integrations/meta/oauth/callback
META_API_VERSION=v23.0          # set to the current Graph API version
META_WEBHOOK_VERIFY_TOKEN=
```
Tokens are encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM). Rotating that key invalidates stored Meta tokens: reconnect afterwards.

## 4. Connecting (Super Admin)

Super Admin → **Integrations** (also reachable at `/settings/integrations`) → Meta → **Connect Meta** → approve in Facebook
→ choose Business, Page, Instagram, Ad account, the CRM website (pipeline) and optionally an assignment team → **Save connection**.

Admins with `integration.view` see status read-only. Meta analytics: **Meta Ads** in the Admin / Super Admin menu (`/marketing/meta`).

## 5. Local development

Meta must reach the webhook, so expose the web app with a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`
or ngrok) and use the tunnel host for `APP_URL`, `CORS_ORIGINS`, `META_REDIRECT_URI` and the webhook callback URL.
The Next.js dev server proxies `/api/*` to the API. Then:

```
cd backend && npm run migrate && npm run dev     # applies 007_marketing_integrations.sql
cd frontend && npm run dev
```
Without Redis, webhook processing runs in-process; with `REDIS_URL` run `npm run worker` too.

## 6. Production

- `npm run migrate` runs automatically in `deploy/deploy-crm.sh`. Migration 007 adds nullable columns + indexes to `leads`
  (back-fills `source_type`), adds the **Site visit** and **Negotiation** statuses, and creates the `meta_*`,
  `integration_logs` and `lead_conversions` tables. On a large `leads` table the ALTER takes a moment; run it off-peak.
- Run the BullMQ worker (`npm run worker`) so webhook leads retry with backoff on Meta outages.
- Set `SYNC_INTERVAL_MINUTES` (e.g. 15) to reconcile automatically; webhooks remain the real-time path.
- If nginx proxies `/api` straight to the API, keep the request body unmodified for the webhook route.

## 7. Testing

Automated: `cd backend && npm test` (normalisation, webhook verification/signatures, OAuth parsing and token exchange,
Graph errors / token expiry, duplicate priority, assignment, sync window, conversions, funnel maths).

End to end (needs a connected Page):
1. Open https://developers.facebook.com/tools/lead-ads-testing, choose the Page and form, **Create lead**.
2. Within seconds: Integrations → Meta → Manage → *Deliveries* shows the lead as `processed`, and *Activity log* shows
   "Webhook received" and "Lead imported".
3. The lead appears in the website's pipeline. Test-tool leads contain "test lead: dummy data" and are flagged
   **junk (test)**: use the leads filter *Include junk* to see them. A real ad submission is not flagged.
4. Click **Delete lead** in the testing tool before re-testing the same form with the same user.
5. **Sync now** should report the lead under "duplicates skipped".
6. Move the lead to Qualified / Site visit / Converted and check the Meta card on the lead page shows the conversion badge.

## 8. Known limitations

- One Meta connection with one Page at a time (the schema allows more Pages; the UI selects one).
- Conversions are recorded in `lead_conversions` and Conversions API payloads are built, but **sending is disabled**
  (`metaConversion.isEnabled()`); it needs a dataset id, a system-user token and Events Manager CRM setup first.
- Meta keeps leads retrievable for 90 days; the first sync looks back 30 days.
- Campaign names/spend need `ads_read` and a selected ad account; without them leads still import (IDs only, no CPL).
- WhatsApp is listed but not implemented; it plugs into the same provider contract (`backend/src/integrations/providers.js`).
