# stupid wallet alerts (wallet-email-notifs)

Email notifications for EVM wallet activity, built on top of
[Stupid Wallet Webhooks](https://wallet-webhooks.stupidtech.net).

Sign in with email, add wallet addresses to watch, and get a notification email
whenever a watched address sends funds, moves native value, or is involved in an
ERC-20 / ERC-721 transfer.

## Tech stack

- **Platform:** Cloudflare Workers + D1 (SQLite). Single Worker serves the SPA
  and the `/api/*` backend; static/asset requests are handled by the Workers
  assets runtime (`run_worker_first: ["/api/*"]`).
- **Framework:** Vite + React (client), Hono (Worker API), `@tanstack/react-query`.
- **Email:** Cloudflare Email Service `send_email` binding (`env.EMAIL`).
- **Events:** `wallet-webhooks.stupidtech.net` POSTs cryptographically signed
  (HMAC-SHA256) webhooks to `/api/webhooks`; we verify, dedupe on the event id,
  and email the owners.
- **Tooling:** `bun`, `oxlint`, `oxfmt`, `wrangler`.

## Working here (agent rules)

1. Before changing code, read `docs/planning.md` and
   `docs/implementation-notes.md`.
2. Keep the architecture in `docs/planning.md`: the webhook receiver is the only
   place that maps inbound signed events to owners and emails them.
3. After making functional changes, update `docs/implementation-notes.md`
   (never include personal info; treat it as public).
4. Auth: magic-link emails → session cookie (`wa_session`). Never store raw
   tokens; store the SHA-256 hash (`lib/crypto.ts`).
5. Env/secret names: wallet-webhooks customer key `WA_API_KEY`, webhook `id`
   `WA_WEBHOOK_ID`, webhook `signingSecret` `WA_SIGNING_SECRET` (secrets), plus
   `APP_BASE_URL`, `EMAIL_FROM`. Load them from `.dev.vars` (dev) / `vars` and
   `wrangler secret`: by (prod).
6. Every API route must validate input with `zod` (`@hono/zod-validator`).
7. Webhook deliveries are at-least-once: dedupe on the `webhook-id` header before
   acting (see `wallet-store.eventSeen/recordEvent`).
8. Keep the API under `/api` (mounted in `src/worker/index.ts`); non-`/api`
   requests are served as static assets / SPA fallback.
9. **Automatic deployments:** pushing to `main` (GitHub) auto-deploys to
   Cloudflare (Workers git integration). No manual `wrangler deploy` needed for
   normal changes; verify what's live with `bunx wrangler deployments list`.