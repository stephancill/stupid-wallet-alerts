# Implementation notes

> Vetted as public documentation — do not include personal info.

## 2026-08-30 — initial build & deploy

Scaffolded the "*stupid wallet alerts*" email service on top of
Stupid Wallet Webhooks. One Cloudflare Worker serves both the React SPA and the
`/api` backend; D1 holds users, sessions, watched wallets, per-chain
subscription state, and an event-dedupe cache.

### What was built

- **Auth**: magic-link sign-in (`/api/auth/request`, `/api/auth/verify`), session
  cookie `wa_session` (HttpOnly, 30-day), tokens stored SHA-256-hashed
  (`src/worker/lib/crypto.ts`). Logout clears the session.
- **Watch list**: `GET/POST/DELETE /api/wallets`, validated with zod; adding a
  wallet calls wallet-webhooks `POST /v1/subscriptions` with the app's webhook;
  per-chain status stored in `wallet_chains`.
- **Webhook receiver** (`/api/webhooks`): verifies the HMAC-SHA256 signature
  (signing secret, ±5 min), dedupes on the `webhook-id` header, resolves owners
  by tracked address, and sends a notification email via the `env.EMAIL`
  binding.
- **Email**: `src/worker/email.ts` — sign-in + activity templates, native-value
  formatting through `viem`, ERC-20/721 effect lines, and `env.EMAIL.send`.
- **Client**: React + react-query; sign-in, add-wallet form (address + chain
  toggles), wallet list with per-chain status chips, remove.

### Infrastructure (done)

- D1 `wallet-alerts-db` created (id `18125da1-baf3-4c8e-9010-3caf8b0dfe1f`);
  `0000_init` applied (remote).
- Custom domain `wallet-alerts.stupidtech.net` (zone `stupidtech.net`) —
  serves SPA + routes `/api/*` to the Worker (`run_worker_first`).
- Deployed Worker per code at `dist/wallet_alerts/wrangler.json` (vite plugin
  bundles the Worker + client assets together).
- Secrets set: `WA_API_KEY`, `WA_SIGNING_SECRET`. Vars set:
  `WA_WEBHOOK_ID=wh_c88349caa126894badf652bf`, `APP_BASE_URL`, `EMAIL_FROM`.
- Wallet-webhooks webhook `wh_c88349caa126894badf652bf` → `/api/webhooks`.
  Signing secret stored — returned only at creation.

### Verified

- Signed test delivery to `/api/webhooks` returns HTTP 200 (signature verified).
- `/api/health`, `/api/auth/session`, `/api/chains` respond correctly.
- Subscription create/deactivate works against wallet-webhooks.

### Email Sending — enabled (resolved)

- **Enabled via dashboard**: Email Sending (beta) for `wallet-alerts.stupidtech.net`
  (zone `stupidtech.net`, sending domain id `7ace53a59d0b4e858394e4e9b89dd40a`).
- DNS records live at the authoritative nameservers:
  - MX × 3 on `cf-bounce.wallet-alerts.stupidtech.net` → `route{1,2,3}.mx.cloudflare.net.`
  - SPF TXT = `v=spf1 include:_spf.mx.cloudflare.net ~all`
  - DKIM TXT on `cf-bounce._domainkey.wallet-alerts.stupidtech.net`
  - DMARC TXT = `v=DMARC1; p=reject;` on `_dmarc.wallet-alerts.stupidtech.net`
- Verified: `POST /api/auth/request` to a real address now returns
  `200 {"ok":true,"sent":true}` (the `env.EMAIL` binding accepts delivery).
  `test@example.com` recipients bounce (temp bounce / example.com doesn't accept),
  which is recipient-side, not a sender problem.
- Auth polish: magic-link TTL raised 10→30 min; session cookie now conditional
  `Secure` (on over https, off over http so localhost dev works); the SPA
  surfaces an "invalid or expired link" notice on `?error=`.
- Email template simplification: removed the boxed/"button" styling — plain
  text-first HTML. The activity email subject now uses the wallet label when
  set (`Activity sent on Ethereum · <label>`), falling back to the short address.
- Wallet labels: editable after registration — `PATCH /api/wallets/:address`
  (`{label}`) + inline label editor per wallet card in the UI (labels otherwise
  were only settable at add time).

### Remaining gotchas

- `wrangler email sending …` CLI still targets a legacy 404 API path; manage
  sending in the dashboard. The `env.EMAIL` binding works regardless.
- The vite-plugin build inlines many top-level exported names (warning about
  `exports`/`connect` on deploy is benign).