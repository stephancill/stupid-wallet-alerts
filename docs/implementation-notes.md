# Implementation notes

> Vetted as public documentation — do not include personal info.

## 2026-08-31 — skip ERC-20 dust notifications

- **`shouldNotifyEmail` filter** (`src/worker/email.ts`): an event only triggers
  a notification email when we can ascribe more than **$0.50** of value to the
  received ERC-20 tokens. Receipts of worthless / unpriced ERC-20s (≤ $0.50 or
  with no resolvable price) are suppressed to cut airdrop/dust spam.
- **Scope**: the filter runs in the webhook route (`routes/webhooks.ts`) after
  `enrichEvent`, gating the entire per-owner email loop. Any other activity still
  notifies — incoming native value, outgoing legs, ERC-721s, or a received
  ERC-20 over the threshold (gating on total received value, per user decision).
- The event is still recorded/deduped regardless of whether an email goes out.

## 2026-08-30 — message improvement round

- **Schema alignment**: `email.ts` now parses the real wallet-webhooks effect
  shape (`kind` = native|erc20|erc721, `direction` = incoming|outgoing|self,
  `assetAddress`) while accepting the legacy `type`/`asset` names, and trusts the
  webhook's `direction` instead of re-deriving it. Real deliveries now render
  (previously most token/native legs fell through to a generic message).
- **Swap pairing**: when an event carries both priced incoming and priced
  outgoing fungible legs, render a single exchange line
  (`<wallet> swapped <out> for <in>`) instead of separate legs, and a matching
  subject. Inbound leg is only used when actually delivered (smart-wallet 4337
  inbound native is not surfaced by the webhook, so those stay one-sided).
- **Subjects identify the wallet**: subjects now start with the wallet label
  (or short address) and include the token symbol,
  e.g. `Treasury received $5 of USDC`, `Main wallet sent $628 of ETH` — not
  "You".
- **Email links**: the notification email now links to the transaction on its
  chain's block explorer (`CHAIN_EXPLORER` + `explorerTxUrl`) and includes a
  "Manage your accounts" footer link to `APP_BASE_URL` (passed from the webhook
  route).
- **Templates**: `notification.html` gained `{{manageUrl}}` footer; both template
  files formatted consistently. Native `kind` effects (delivered as
  `amount` wei) are priced like ERC-20s.

- **Template roles — no repeating string**: the email subject carries the one-line
  summary, the HTML `<h2>` heading shows only the account name (`{{account}}`),
  and the body `<li>` lines show just the legs (direction + amount + symbol) —
  removing the phrase that previously appeared in all three places.

## 2026-08-30 — email templates as versioned files

Moved both email templates out of template literals into real, versionable files
so the HTML can be reviewed/diff'd and edited directly:

- `src/worker/templates/notification.html` and `src/worker/templates/sign-in.html`
- Loaded into the Worker bundle via Vite `?raw` imports; rendered with a tiny
  `{{key}}` placeholder substitution (`render()` in `email.ts`). No runtime
  templating dependency.
- Plain-text fallbacks and subject lines stay in code (`email.ts`); preview via
  `bun scripts/preview-emails.ts → /tmp/wallet-alerts-emails.html`.

## 2026-08-30 — token details & USD pricing for transfer emails

Emails now resolve token metadata (symbol/decimals) and USD prices so transfer
lines read like an app notification (e.g. Aave's "You received $5").

- **Source:** DeFiLlama `coins.llama.fi/prices/current/{chain}:{address}`, called
  from the Worker. Chain id → DeFiLlama slug map in `src/worker/lib/token-info.ts`
  (ethereum, arbitrum, base, optimism, polygon, gnosis, avalanche, bsc).
- **Caching**: new `0001_token_cache` D1 table keyed by `(chain_id, address)`;
  `getToken()` serves fresh rows for 10 min and refreshes prices in place.
  Native coins keyed by sentinel `$NATIVE:<chainId>` (no clash with contracts).
- **Enrichment** (`src/worker/email.ts` `enrichEvent`): resolves each ERC-20
  effect's token and computes `humanAmount` + `usdValue`; if a tx moves native
  value with no priced token effects, prices the chain's native coin too.
- **Formatting**: subject is Aave-style `You received $5` / `You sent $2.50`;
  body line is `<label> (<shortAddr>) received/sent $X of <symbol>`, falling
  back to raw amount+symbol when a price isn't available.
- **Webhook route** (`routes/webhooks.ts`) now calls `enrichEvent` once per event
  (resolved once, then emailed to every owner), keeping the webhook receiver the
  single place that maps events → owners → emails.

Deploy notes: a new column doesn't exist so the new table requires applying
`0001_token_cache` to the remote D1 (`bun run db:migrate`) when deploying.

## 2026-08-30 — migrate UI to shadcn/ui

Rebuilt the client on **shadcn/ui** (new-york style, neutral palette, Tailwind
v4) and bootstrapped its foundation.

- Added the shadcn stack: `components.json`, path alias `@/* -> src/*`
  (tsconfig + vite), `src/lib/utils.ts` (`cn` via clsx + tailwind-merge), the
  Tailwind v4 theme+preflight in `src/styles.css` (added `tw-animate-css`), and
  `next-themes` (light-only) so the `sonner` toaster can resolve a theme.
- Added shadcn primitives under `src/components/ui/`: `button`, `card`, `input`,
  `label`, `checkbox`, `select`, `badge`, `alert`, `sonner`. Components are
  generated from the unified `radix-ui` package.
- Rewrote the views to use them: `App` (invalid-link `Alert`), `SignIn` (`Card`
  + `Input` + `Button`), `Dashboard` (`Button` sign-out), `AddWalletForm`
  (`Card` + chain `Checkbox` grid), `WalletList` (per-wallet `Card`, per-chain
  `Badge` mapped from status, `Select`-based chain picker in the edit form,
  `Input` label editor).
- Switched inline error/success text to `sonner` toasts (`<Toaster richColors />`
  mounted in `main.tsx`).
- Dropped the "layout-only, no preflight" CSS so shadcn primitives (which rely on
  Tailwind preflight + theme vars) render correctly; form controls no longer use
  native browser styling.

### Infrastructure (done)

- Deps added: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`,
  `tw-animate-css`, `radix-ui`, `sonner`, `next-themes`. Removed the unused
  `@radix-ui/react-slot`. Verified `bun run build` (client + Worker bundle) and
  `bunx oxlint` pass.

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
- Deliverability: sending moved from the brand-new subdomain to a dedicated
  sending domain `alerts.stupidtech.net`; `EMAIL_FROM=alerts@alerts.stupidtech.net`
  with `Reply-To: hi@stupidtech.net` on every message. Email Sending for the
  new domain is enabled + DNS live (SPF/DKIM/DMARC p=reject/MX). mail-tester
  reports 10/10 & "properly authenticated" for both domains.

### Remaining gotchas

- `wrangler email sending …` CLI still targets a legacy 404 API path; manage
  sending in the dashboard. The `env.EMAIL` binding works regardless.
- The vite-plugin build inlines many top-level exported names (warning about
  `exports`/`connect` on deploy is benign).