# RMW CRM

A central CRM for leads from **MPF** (MyPropertyFact), **RMW** (Ritz Media World) and **CT** (Contenaissance). The three websites keep their own lead systems and push each lead to the CRM over authenticated webhooks.

- `backend/`: Node.js, Express, MySQL (Aiven) via `mysql2`, Socket.IO, Redis + BullMQ, JavaScript only
- `frontend/`: Next.js (App Router), React, Tailwind, shadcn-style components (`.jsx`), TanStack Query, Socket.IO client
- `docs/EXISTING_LEAD_FLOWS.md`: how each website captures leads today (inspected before building)
- `docs/INTEGRATION_GUIDE.md`: how to connect each website

## Quick start (local)

```bash
# 1. Backend
cd backend
cp .env.example .env          # fill DB_* (Aiven), APP_ENCRYPTION_KEY, OTP_SECRET, SMS_*
npm install
npm run migrate               # creates all tables
npm run seed                  # roles, permissions, websites, statuses, default teams
npm run create-super-admin    # interactive; the first login asks for an SMS OTP
npm run dev                   # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Optional: set `REDIS_URL` and run `npm run worker` in `backend/` for BullMQ queues and retries. Without Redis, background jobs run in the API process (fine for development). For web push, run `npm run vapid:generate` and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.

### Aiven MySQL

Download the CA certificate from the Aiven console (service → Overview → CA certificate), save it as `backend/certs/aiven-ca.pem`, and set `DB_SSL=true` and `DB_SSL_CA=./certs/aiven-ca.pem`. Without the CA, TLS is still used but the server certificate is not verified (a warning is logged).

## Architecture

```
Website (MPF/RMW/CT) ──POST /api/integrations/<site>/leads──► Express
   key (+HMAC) auth → validate (adapter) → integration_events (idempotency) → BullMQ lead-sync
   → upsert lead + attribution (transaction) → duplicate detection → activity → audit
   → Socket.IO NEW_LEAD + in-app/push/email notifications

Browser ──/api (Next.js rewrite, same-origin cookies)──► Express
   Route → Controller → Service → Repository → MySQL
```

### Security model

- **Sessions:** a random token in an HTTP-only, SameSite=Lax cookie. Only its SHA-256 is stored. Idle timeout and absolute expiry are configurable. Revocation takes effect immediately, including Socket.IO force-logout.
- **New-device verification:** a server-generated device cookie is mapped to a `user_devices` row. Email and password on an unrecognised (or untrusted, or expired-trust) device always require an SMS OTP. "Trust this device" lasts 7, 30 or 90 days and is never permanent.
- **OTP:** 6 digits from a CSPRNG. Stored as HMAC(OTP_SECRET, row id + OTP). 5-minute expiry, 5 attempts, 60-second resend cooldown, 5 sends per number per hour, plus IP rate limits. The real SMS gateway is used; there is no test bypass. A mobile-OTP request responds identically for unknown numbers.
- **RBAC:** permissions are loaded from the DB on every request. Areas (`area.crm`, `area.admin`, `area.super_admin`) gate `/api/crm`, `/api/admin` and `/api/super-admin` separately from the UI. Users can only grant roles below their own level.
- **Website access:** every lead query is filtered by the caller's websites, and by assignee unless they hold `lead.view_all`.
- **CSRF:** writes require an allowed Origin, on top of SameSite cookies and JSON-only bodies. **XSS / SQLi:** React escaping, parameterised SQL only, Helmet headers. **Secrets:** bcrypt (12 rounds) for passwords, single-use hashed reset tokens, and pino redaction for passwords, OTPs, tokens and keys.
- **Audit:** every event in spec §45 is written to `audit_logs`. Credentials and OTPs are scrubbed.

### Accounts

`/register` creates a user with status `PENDING_APPROVAL`. A Super Admin approves the request (setting role, department, teams and websites) or rejects it. Only `ACTIVE` users can sign in. Disabling or suspending a user revokes all of their sessions.

## Scripts (backend)

| Script | Purpose |
|---|---|
| `npm run migrate` | Apply new SQL migrations from `src/db/migrations` (version-controlled, run once each) |
| `npm run seed` | Idempotent reference data |
| `npm run create-super-admin` | Bootstrap the first Super Admin |
| `npm run integration:key -- <MPF\|RMW\|CT> [--signed]` | Generate a website API key |
| `npm run worker` | BullMQ workers + follow-up reminder scheduler |
| `npm test` | Adapter / attribution tests |

## Production notes

- Serve the frontend and API under one domain (for example `crm.example.com`), with nginx proxying `/api` and `/socket.io` (WebSocket upgrade) to Express. Then set `COOKIE_SECURE=true`, `CORS_ORIGINS=https://crm.example.com`, `APP_URL=https://crm.example.com` and `NEXT_PUBLIC_SOCKET_URL=` (empty, meaning same origin).
- Run Redis, the API (one or more instances; the Socket.IO Redis adapter is enabled automatically) and one worker process.
- Rate limiters use in-memory stores; use `rate-limit-redis` when running several API instances.
