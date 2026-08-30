import { Hono } from "hono";
import { verifyWebhookSignature as verifyHmac } from "../lib/crypto";
import { buildNotificationEmail, sendEmail, type EventData } from "../email";
import type { Env } from "../lib/env";
import { eventSeen, ownerOfWallet, recordEvent } from "../wallet-store";

export const webhookRoute = new Hono<{ Bindings: Env }>();

/**
 * Receive a signed, at-least-once delivery from wallet-webhooks.
 * We verify the HMAC, dedupe on the deterministic event id, then email every
 * owner of the tracked address.
 */
webhookRoute.post("/", async (c) => {
  const body = await c.req.raw.text();
  const incoming = c.req.raw.headers;

  const valid = await verifyHmac(c.env.WA_SIGNING_SECRET, body, incoming);
  if (!valid) return c.text("unauthorized", 401);

  const webhookId = incoming.get("webhook-id") ?? "";
  if (!webhookId || (await eventSeen(c.env.WA_DB, webhookId))) {
    // Already handled (at-least-once delivery) or missing id.
    return c.text("ok", 200);
  }

  let payload: { type?: string; data?: EventData };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.text("bad request", 400);
  }

  const data = payload.data;
  if (data?.trackedAddress) {
    const owners = await ownerOfWallet(c.env.WA_DB, data.trackedAddress.toLowerCase());
    for (const owner of owners) {
      await sendEmail(
        c.env,
        owner.email,
        buildNotificationEmail({
          email: owner.email,
          walletLabel: owner.label,
          data,
        }),
      ).catch(() => {
        // one bad recipient must not block the rest; the ledger offers retries
      });
    }
  }

  await recordEvent(c.env.WA_DB, webhookId);
  return c.text("ok", 200);
});
