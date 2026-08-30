export interface ChainState {
  chainId: number;
  externalSubscriptionId: string | null;
  status: string;
  activeFromBlock: string | null;
  message: string | null;
}

export interface WalletRow {
  address: string;
  label: string | null;
  chain_ids: number[];
  created_at: string;
}

const WALLET_COLS = "address, user_id, label, chain_ids, created_at";

export async function addWallet(
  db: D1Database,
  params: { address: string; label: string | null; chainIds: number[]; userId: string },
): Promise<void> {
  const { address, label, chainIds, userId } = params;
  await db
    .prepare(
      `INSERT OR IGNORE INTO wallets (${WALLET_COLS}) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    )
    .bind(address, userId, label, JSON.stringify(chainIds))
    .run();
}

export async function listWallets(
  db: D1Database,
  userId: string,
): Promise<(WalletRow & { chains: ChainState[] })[]> {
  const rows = await db
    .prepare(
      `SELECT w.address, w.user_id, w.label, w.chain_ids, w.created_at
         FROM wallets w WHERE w.user_id = ? ORDER BY w.created_at DESC`,
    )
    .bind(userId)
    .all<{
      address: string;
      user_id: string;
      label: string | null;
      chain_ids: string;
      created_at: string;
    }>();

  const out: (WalletRow & { chains: ChainState[] })[] = [];
  for (const row of rows.results) {
    const chains = await db
      .prepare(
        `SELECT chain_id, external_subscription_id, status, active_from_block, message
           FROM wallet_chains WHERE wallet_address = ? ORDER BY chain_id`,
      )
      .bind(row.address)
      .all<{
        chain_id: number;
        external_subscription_id: string | null;
        status: string;
        active_from_block: string | null;
        message: string | null;
      }>();
    out.push({
      address: row.address,
      label: row.label,
      chain_ids: JSON.parse(row.chain_ids) as number[],
      created_at: row.created_at,
      chains: chains.results.map((c) => ({
        chainId: c.chain_id,
        externalSubscriptionId: c.external_subscription_id,
        status: c.status,
        activeFromBlock: c.active_from_block,
        message: c.message,
      })),
    });
  }
  return out;
}

export async function getWallet(
  db: D1Database,
  address: string,
  userId: string,
): Promise<WalletRow | null> {
  return db
    .prepare(`SELECT ${WALLET_COLS} FROM wallets WHERE address = ? AND user_id = ?`)
    .bind(address, userId)
    .first<WalletRow>();
}

export async function deleteWallet(db: D1Database, address: string, userId: string): Promise<void> {
  await db
    .prepare("DELETE FROM wallets WHERE address = ? AND user_id = ?")
    .bind(address, userId)
    .run();
}

export async function upsertChain(
  db: D1Database,
  walletAddress: string,
  chain: {
    chainId: number;
    status: string;
    externalSubscriptionId?: string | null;
    activeFromBlock?: string | null;
    message?: string | null;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO wallet_chains (wallet_address, chain_id, external_subscription_id, status, active_from_block, message)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (wallet_address, chain_id) DO UPDATE SET
         external_subscription_id = excluded.external_subscription_id,
         status = excluded.status,
         active_from_block = excluded.active_from_block,
         message = excluded.message`,
    )
    .bind(
      walletAddress,
      chain.chainId,
      chain.externalSubscriptionId ?? null,
      chain.status,
      chain.activeFromBlock ?? null,
      chain.message ?? null,
    )
    .run();
}

export async function setWalletLabel(
  db: D1Database,
  address: string,
  userId: string,
  label: string | null,
): Promise<void> {
  await db
    .prepare("UPDATE wallets SET label = ? WHERE address = ? AND user_id = ?")
    .bind(label, address, userId)
    .run();
}

/** Find the owner(s) of a wallet from an inbound event (lowercased address). */
export async function ownerOfWallet(
  db: D1Database,
  address: string,
): Promise<{ user_id: string; email: string; label: string | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, w.label
         FROM wallets w JOIN users u ON u.id = w.user_id
        WHERE w.address = ?`,
    )
    .bind(address.toLowerCase())
    .all<{ user_id: string; email: string; label: string | null }>();
  return results;
}

/** Have we already handled this deterministic event id? */
export async function eventSeen(db: D1Database, webhookId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT webhook_id FROM events WHERE webhook_id = ?")
    .bind(webhookId)
    .first();
  return !!row;
}

export async function recordEvent(db: D1Database, webhookId: string): Promise<void> {
  await db.prepare("INSERT INTO events (webhook_id) VALUES (?)").bind(webhookId).run();
}
