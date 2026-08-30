import { zValidator } from "@hono/zod-validator";
import { Context, Hono } from "hono";
import { isAddress } from "viem";
import { z } from "zod";
import type { User } from "../auth-store";
import { sessionUser } from "../auth-store";
import type { Env } from "../lib/env";
import { webhooksClient } from "../lib/wallet-webhooks";
import {
  addWallet,
  deleteWallet,
  listWallets,
  upsertChain,
  setWalletLabel,
  getWallet as walletRow,
} from "../wallet-store";
import { parseCookies, SESSION_COOKIE } from "./_helpers";

type Ctx = Context<{ Bindings: Env; Variables: { user: User } }>;

export const wallets = new Hono<{ Bindings: Env; Variables: { user: User } }>();

async function requireUser(c: Ctx, next: () => Promise<void>) {
  const cookies = parseCookies(c.req.raw.headers.get("cookie"));
  const user = await sessionUser(c.env.WA_DB, cookies[SESSION_COOKIE]);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
}

const addWalletSchema = z.object({
  address: z.string().min(1).max(64),
  label: z.string().trim().max(80).optional(),
  chainIds: z.array(z.number().int().positive()).min(1).max(50),
});

/** List the current user's wallets + per-chain subscription state. */
wallets.get("/", requireUser, async (c) => {
  const user = c.get("user");
  const rows = await listWallets(c.env.WA_DB, user.id);
  return c.json({ wallets: rows });
});

/** Watch a new wallet address on the given chains. */
wallets.post("/", requireUser, zValidator("json", addWalletSchema), async (c) => {
  const user = c.get("user");
  const { address, label, chainIds } = c.req.valid("json");

  if (!isAddress(address)) {
    return c.json({ error: "invalid address" }, 422);
  }

  const addr = address.toLowerCase();
  const client = webhooksClient(c.env.WA_API_KEY, c.env.WA_WEBHOOK_ID);

  await addWallet(c.env.WA_DB, {
    address: addr,
    label: label ?? null,
    chainIds,
    userId: user.id,
  });

  // Subscribe each requested chain; record status from the provider response.
  const created = await client.createSubscriptions(addr, chainIds);
  for (const sub of created) {
    const chainId = sub.chainId;
    await upsertChain(c.env.WA_DB, addr, {
      chainId,
      status: sub.status ?? "error",
      externalSubscriptionId: sub.id ?? null,
      activeFromBlock: sub.activeFromBlock ?? null,
      message: sub.message ?? sub.reason ?? null,
    });
  }

  const rows = await listWallets(c.env.WA_DB, user.id);
  const watched = rows.find((r) => r.address === addr) ?? null;
  return c.json({ wallet: watched }, 201);
});

/** Stop watching a wallet (deactivates its remote subscriptions). */
wallets.delete("/:address", requireUser, async (c) => {
  const user = c.get("user");
  const addr = (c.req.param("address") || "").toLowerCase();
  const row = await walletRow(c.env.WA_DB, addr, user.id);
  if (!row) return c.json({ error: "not found" }, 404);

  const client = webhooksClient(c.env.WA_API_KEY, c.env.WA_WEBHOOK_ID);
  const { chains } = (await listWallets(c.env.WA_DB, user.id)).find((r) => r.address === addr)!;
  // Best-effort deactivation, then remove rows.
  await Promise.allSettled(
    chains
      .filter((ch) => ch.externalSubscriptionId)
      .map((ch) => client.deactivateSubscription(ch.externalSubscriptionId!)),
  );
  await deleteWallet(c.env.WA_DB, addr, user.id);
  return c.json({ ok: true });
});

const updateWalletSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  chainIds: z.array(z.number().int().positive()).min(1).max(50).optional(),
});

/** Edit a watched wallet: label and/or active chains (syncs upstream subs). */
wallets.patch("/:address", requireUser, zValidator("json", updateWalletSchema), async (c) => {
  const user = c.get("user");
  const addr = (c.req.param("address") || "").toLowerCase();
  const body = c.req.valid("json");

  const current = (await listWallets(c.env.WA_DB, user.id)).find((r) => r.address === addr);
  if (!current) return c.json({ error: "not found" }, 404);

  if (body.label !== undefined) {
    await setWalletLabel(c.env.WA_DB, addr, user.id, body.label);
  }

  if (body.chainIds) {
    const client = webhooksClient(c.env.WA_API_KEY, c.env.WA_WEBHOOK_ID);
    const existing = current.chains.map((ch) => ch.chainId);
    const desired = body.chainIds;

    // Subscribe newly added chains.
    const toAdd = desired.filter((id) => !existing.includes(id));
    if (toAdd.length > 0) {
      const created = await client.createSubscriptions(addr, toAdd);
      for (const sub of created) {
        await upsertChain(c.env.WA_DB, addr, {
          chainId: sub.chainId,
          status: sub.status ?? "error",
          externalSubscriptionId: sub.id ?? null,
          activeFromBlock: sub.activeFromBlock ?? null,
          message: sub.message ?? sub.reason ?? null,
        });
      }
    }

    // Deactivate removed chains (best-effort) and drop their rows.
    const toRemove = existing.filter((id) => !desired.includes(id));
    for (const chainId of toRemove) {
      const sub = current.chains.find((ch) => ch.chainId === chainId);
      if (sub?.externalSubscriptionId) {
        await client.deactivateSubscription(sub.externalSubscriptionId).catch(() => {});
      }
      await c.env.WA_DB.prepare(
        "DELETE FROM wallet_chains WHERE wallet_address = ? AND chain_id = ?",
      )
        .bind(addr, chainId)
        .run();
    }

    await c.env.WA_DB.prepare("UPDATE wallets SET chain_ids = ? WHERE address = ? AND user_id = ?")
      .bind(JSON.stringify(desired), addr, user.id)
      .run();
  }

  const updated = (await listWallets(c.env.WA_DB, user.id)).find((r) => r.address === addr);
  return c.json({ wallet: updated });
});

/** Public chain list from the provider (cached per edge), for the add form. */
export const chains = new Hono<{ Bindings: Env }>();

chains.get("/", async (c) => {
  const client = webhooksClient(c.env.WA_API_KEY, c.env.WA_WEBHOOK_ID);
  try {
    const list = await client.listChains();
    return c.json({ chains: list });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502);
  }
});
