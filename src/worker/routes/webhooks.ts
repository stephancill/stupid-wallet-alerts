import { Hono } from "hono";
import { verifyWebhookSignature as verifyHmac } from "../lib/crypto";
import {
  buildNotificationEmail,
  enrichEvent,
  sendEmail,
  shouldNotifyEmail,
  type EventData,
} from "../email";
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
    // Resolve token prices once (per event), then email every owner.
    const resolved = await enrichEvent(c.env, data).catch(() => ({
      effects: [],
    }));
    // Drop dust events (≤ $0.50 total priced value) so tiny activity doesn't spam.
    if (shouldNotifyEmail(data, resolved)) {
      const owners = await ownerOfWallet(c.env.WA_DB, data.trackedAddress.toLowerCase());
      for (const owner of owners) {
        await sendEmail(
          c.env,
          owner.email,
          buildNotificationEmail({
            email: owner.email,
            walletLabel: owner.label,
            data,
            resolved,
            appUrl: c.env.APP_BASE_URL,
          }),
        ).catch(() => {
          // one bad recipient must not block the rest; the ledger offers retries
        });
      }
    }
  }

  await recordEvent(c.env.WA_DB, webhookId);
  return c.text("ok", 200);
});
