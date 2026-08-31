import type { Env } from "./env";

/** DeFiLlama chain slugs by our chain id (only ones it can price). */
const CHAIN_SLUGS: Record<number, string> = {
  1: "ethereum",
  10: "optimism",
  137: "polygon",
  8453: "base",
  42161: "arbitrum",
  43114: "avalanche",
  56: "bsc",
  100: "gnosis",
};

export function defillamaChain(chainId: number): string | null {
  return CHAIN_SLUGS[chainId] ?? null;
}

/** Chain-specific token address DeFiLlama uses to price the native coin. */
const NATIVE_REFERENCE: Record<number, string> = {
  1: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  10: "0x4200000000000000000000000000000000000006", // wETH on Optimism
  8453: "0x4200000000000000000000000000000000000006", // wETH on Base
  42161: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // wETH on Arbitrum
  137: "0x0d500b1d8e8ef31e21c99d1db9a278c28e7d44a59", // wMATIC on Polygon
};
export function nativeReference(chainId: number): string | null {
  return NATIVE_REFERENCE[chainId] ?? null;
}

/** Resolved & cached token metadata plus its USD price. */
export interface ResolvedToken {
  symbol: string;
  decimals: number;
  priceUsd: number;
}

/** How long a cached price stays usable before we refresh from the source. */
const TTL_MS = 10 * 60 * 1000;

/**
 * Resolve a token's (symbol, decimals, USD price) on a chain, caching in D1.
 * The native coin of a supported chain is the null-address sentinel de0x * — we
 * enumerate it with `native` vs `normal` via the `native` flag, keying the cache
 * by `$NATIVE:<chainId>` so we never clash with a real contract.
 * Returns null when the chain/address isn't pricable.
 */
export async function getToken(
  env: Env,
  chainId: number,
  address: string | null,
  native = false,
): Promise<ResolvedToken | null> {
  const chain = defillamaChain(chainId);
  if (!chain) return null;

  // Cache key: native coins keyed by sentinel, ERC-20s by lowercase address.
  const cacheKey = native ? `$NATIVE:${chainId}` : (address ?? "").toLowerCase();
  const lib = native ? nativeReference(chainId) : cacheKey;
  if (!lib || !lib.startsWith("0x")) return null;

  const row = await env.WA_DB.prepare(
    `SELECT symbol, decimals, price_usd, fetched_at
       FROM token_cache WHERE chain_id = ? AND address = ?`,
  )
    .bind(chainId, cacheKey)
    .first<{ symbol: string; decimals: number; price_usd: number; fetched_at: string }>();
  if (row && Date.now() - Date.parse(row.fetched_at) < TTL_MS) {
    return { symbol: row.symbol, decimals: row.decimals, priceUsd: row.price_usd };
  }

  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${chain}:${lib}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      coins?: Record<string, { symbol: string; decimals: number; price: number }>;
    };
    const coin = json.coins?.[`${chain}:${lib}`];
    if (!coin || typeof coin.price !== "number") return null;

    const next = { symbol: coin.symbol, decimals: coin.decimals, priceUsd: coin.price };

    await env.WA_DB.prepare(
      `INSERT INTO token_cache (chain_id, address, symbol, decimals, price_usd)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (chain_id, address) DO UPDATE SET
         symbol = excluded.symbol,
         decimals = excluded.decimals,
         price_usd = excluded.price_usd,
         fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    )
      .bind(chainId, cacheKey, next.symbol, next.decimals, next.priceUsd)
      .run();

    return next;
  } catch {
    return null;
  }
}
