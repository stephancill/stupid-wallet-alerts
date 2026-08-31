-- Token info + price cache for email enrichment.
-- keyed by (chain_id, address); address lowercase hex. Refresh price in place.
CREATE TABLE IF NOT EXISTS token_cache (
  chain_id    INTEGER NOT NULL,
  address     TEXT    NOT NULL,            -- lowercase contract / native address
  symbol      TEXT    NOT NULL,
  decimals    INTEGER NOT NULL,
  price_usd   REAL    NOT NULL,
  fetched_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chain_id, address)
);