/** Random URL-safe base64 token (e.g. for magic links & sessions). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

/** SHA-256 hex digest of the given string (for hashing tokens at rest). */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TIMESTAMP_RE = /^\d+$/;

/// --- HMAC signature verification for inbound webhooks (wallet-webhooks) ---

/** Verify the signed webhook delivery per the wallet-webhooks spec. */
export async function verifyWebhookSignature(
  secret: string,
  body: string,
  headers: Headers,
): Promise<boolean> {
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!timestamp || !signatureHeader || !TIMESTAMP_RE.test(timestamp)) return false;

  // ±5 minute replay tolerance
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatureHeader === `v1,${expected}`;
}
