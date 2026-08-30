# Planning — stupid wallet alerts

## Purpose

A web app that emails you when a monitored EVM address transacts. It sits on top
of the **Stupid Wallet Webhooks** service (a signed-webhook event feed for EVM
address activity) and adds two things the webhook service doesn't do:

1. A human identity layer (sign in with email) and a wallet watch-list UI.
2. **Email** — turning raw signed webhook events into readable notification
   emails.

## Domain

- `wallet-alerts.stupidtech.net` (Cloudflare custom domain, zone `stupidtech.net`).

## Architecture

```
┌────────────┐   magic link / CRUD   ┌──────────────────────────────┐
│  Browser   │ ──────── ──────── ▶ │  stupid wallet alerts Worker      │
│  (React    │                       │  (Vite SPA + Hono /api)      │
│   SPA)     │ ────────────────────▶ │  - /api/auth/*  magic links    │
└────────────┘                       │  - /api/wallets/* watch-list   │
                                     │  - /api/webhooks  (inbound)    │
                                     │       │                       │
                                     │       ├── verify HMAC          │
                                     │       ├── dedupe (webhook-id)  │
                                     │       ├── map addr → owners    │
                                     │       └── sendEmail(...)       │
                                     │  - /api/chains                │
                                     └───────────────┬────────────────┘
                                          D1 (SQLite)│   env.EMAIL binding
                                     ┌────────────────▼────────────────┐
                      store/eager     │      Clouflare Email Service     │
                                     └─────────────────────────────────┘
        subscribe address + chains
               │                          signed HMAC-SHA256 events
               ▼                                  ▲
   ┌─────────────────────────┐                  │
   │  wallet-webhooks         │  POST /api/webhooks (signed, at-least-once)
   │  (EVM scanner, operator) │ ───────────────────┘
   └─────────────────────────┘
```

### Flow

1. **Auth**: `POST /api/auth/request {email}` → issue one-time magic token,
   email a sign-in link. Link hits `GET /api/auth/verify`, sets the `wa_session`
   HttpOnly cookie, redirects home. Sessions & magic tokens are stored hashed
   (SHA-256); expiry 30d / 10min.

2. **Watch a wallet**: `POST /api/wallets {address, chainIds}` → validate address,
   store row, call the wallet-webhooks API `POST /v1/subscriptions` with our
   webhook id, persist the per-chain response (`active | unsupported | quota …`).

3. **Event → email**: wallet-webhooks `POST`s a signed event → `/api/webhooks`:
   verify HMAC (`signingSecret`, ±5min), dedupe on `webhook-id`, look up owners
   by `trackedAddress`, then `env.EMAIL.send(...)` a notification email.

## Key decisions

- **Email provider**: Cloudflare Email Service (`send_email` binding) — native
  to Workers, cheap at the low volume this service generates. Fallback/beta
  caveat: sending the zone must be enabled & From-domain verified.
- **One webhook** for the whole app; subscriptions are per `(address × chain)`
  under that webhook. This keeps `signingSecret` handling to a single secret.
- **Per-event emails** (no digest batching) — decided by the user.
- **No historical backfill**: activity begins at each subscription's
  activation block (matches the upstream service).

## Non-goals

- Token names/prices/values (upstream only emits raw on-chain values).
- Digest / frequency caps.
- Multi-admin / quotas (single operator account for now).

## Open items

- None blocking. Cloudflare **Email Sending** is enabled for
  `wallet-alerts.stupidtech.net` (SPF / DKIM / DMARC / MX DNS records live) and
  the app sends end-to-end. Remaining polish items live in
  `docs/implementation-notes.md` (e.g. `wrangler email` CLI still hits a legacy
  API path; manage sending in the dashboard).