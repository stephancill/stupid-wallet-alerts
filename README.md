# stupid wallet alerts

[![Live app](https://img.shields.io/badge/try%20it-wallet--alerts.stupidtech.net-2563eb?style=flat-square&logo=cloudflare)](https://wallet-alerts.stupidtech.net)

🔔 Email alerts for your EVM wallets — **stupid wallet alerts**.

Sign in with your email, add wallet addresses to watch, and get an email
whenever a watched address transacts, receives native value, or is involved in
an ERC-20 / ERC-721 transfer — built on top of
[Stupid Wallet Webhooks](https://wallet-webhooks.stupidtech.net) (signed,
at-least-once events) and delivered through Cloudflare Email Service.

**Live at <https://wallet-alerts.stupidtech.net>**

## How it works

1. **Sign in with email** — a magic link signs you in (no password).
2. **Add wallets** — paste an address and pick chains to watch (Ethereum,
   Arbitrum, Base, Optimism, …).
3. **Get emailed** — each on-chain event is delivered to our webhook receiver,
   verified against the webhook's `signingSecret`, deduped, and routed to the
   wallet's owner as an email.

## Architecture

Single Cloudflare Worker (Vite + React SPA + Hono `/api`), D1 for storage:

```
Browser ──▶ Worker (/api/*) ──▶ wallet-webhooks API ──▶ EVM scanner
   ▲            │                                          │
   │            └── /api/webhooks (signed events) ◀────────┘
   │                               │
   │                               ▼ verify → dedupe → owner → email
   └────────── SPA (assets)    env.EMAIL (Cloudflare Email Service)
```

See **[docs/planning.md](docs/planning.md)** for the full design and
**[docs/implementation-notes.md](docs/implementation-notes.md)** for build
details.

## Development

Requires `bun`, `wrangler` (auth'd), and a `.dev.vars` file (see `.dev.vars.example`).

```bash
bun install
bun run dev        # local (wrangler dev; SPA + Worker)
# schema changes:
bun run db:migrate # apply D1 migrations (--remote)
bun run deploy     # build + deploy
bun run lint && bun run format
```

## Configuration

| Env | Where | Meaning |
| --- | --- | --- |
| `WA_API_KEY` | secret | wallet-webhooks customer API key |
| `WA_WEBHOOK_ID` | var | our webhook id on wallet-webhooks |
| `WA_SIGNING_SECRET` | secret | webhook `signingSecret` (verify inbound) |
| `APP_BASE_URL` | var | public base URL |
| `EMAIL_FROM` | var | verified sender address (Email Service) |

## Status

Core app is deployed and verified: webhook signature verification, wallet
subscriptions, chains API, and **email delivery** — Cloudflare Email Sending is
enabled for `wallet-alerts.stupidtech.net` (SPF/DKIM/DMARC/MX live), so sign-in
magic links and activity notifications send end-to-end. See
[docs/implementation-notes.md](docs/implementation-notes.md) for details.