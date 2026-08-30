-- stupid wallet alerts schema
-- Users sign in with email magic links; add wallets to receive email on EVM activity.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One-time magic-link sign-in codes
CREATE TABLE IF NOT EXISTS magic_tokens (
  token_hash  TEXT PRIMARY KEY,            -- sha256 hex of the raw token
  email       TEXT NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER NOT NULL             -- epoch ms
);

-- HTTP session cookies (stateless token hashed at rest)
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,        -- sha256 hex of the session token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  INTEGER NOT NULL             -- epoch ms
);

-- A wallet a user wants to monitor. chain_ids = the chains we try to subscribe.
CREATE TABLE IF NOT EXISTS wallets (
  address     TEXT PRIMARY KEY,            -- lowercase
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT,
  chain_ids   TEXT NOT NULL,               -- JSON array of numbers
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Per-chain subscription state within wallet webhooks (one row per address+chain)
CREATE TABLE IF NOT EXISTS wallet_chains (
  wallet_address           TEXT NOT NULL REFERENCES wallets(address) ON DELETE CASCADE,
  chain_id                 INTEGER NOT NULL,
  external_subscription_id TEXT,           -- sub_... from the webhooks API (NULL if not created)
  status                   TEXT NOT NULL,  -- pending|active|unsupported|quota|conflict|error|deleting
  active_from_block        TEXT,
  message                  TEXT,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (wallet_address, chain_id)
);

-- Dedupe cache for inbound webhook events (keyed by deterministic webhook-id)
CREATE TABLE IF NOT EXISTS events (
  webhook_id  TEXT PRIMARY KEY,            -- the deterministic event id we have handled
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_chains_address ON wallet_chains(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);