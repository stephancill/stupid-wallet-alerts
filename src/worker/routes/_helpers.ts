import type { Hono } from "hono";
import type { Env } from "../lib/env";

export const SESSION_COOKIE = "wa_session";

export type App = Hono<{ Bindings: Env }>;

/** Minimal cookie parser. */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function setSessionCookie(
  header: { append: (n: string, v: string) => void },
  value: string,
  secure = true,
): void {
  header.append(
    "set-cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; HttpOnly;${secure ? " Secure;" : ""} Path=/; Max-Age=2592000; SameSite=Lax`,
  );
}

export function clearSessionCookie(
  header: { append: (n: string, v: string) => void },
  secure = true,
): void {
  header.append(
    "set-cookie",
    `${SESSION_COOKIE}=; HttpOnly;${secure ? " Secure;" : ""} Path=/; Max-Age=0; SameSite=Lax`,
  );
}
