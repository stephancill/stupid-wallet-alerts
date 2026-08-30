import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  consumeMagicToken,
  createMagicToken,
  createSession,
  deleteSession,
  getUserByEmail,
  sessionUser,
} from "../auth-store";
import { buildSignInEmail, sendEmail } from "../email";
import type { Env } from "../lib/env";
import { clearSessionCookie, parseCookies, setSessionCookie, SESSION_COOKIE } from "./_helpers";

const requestSchema = z.object({ email: z.string().trim().email().max(254) });

export const auth = new Hono<{ Bindings: Env }>();

/** Step 1: email → send a magic sign-in link. */
auth.post("/request", zValidator("json", requestSchema), async (c) => {
  const { email } = c.req.valid("json");
  const db = c.env.WA_DB;

  await getUserByEmail(db, email); // ensure a user row exists so signing in is seamless
  const token = await createMagicToken(db, email);

  const magicLink = `${c.env.APP_BASE_URL}/api/auth/verify?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  await sendEmail(c.env, email, buildSignInEmail({ magicLink }));

  return c.json({ ok: true, sent: true }, 200);
});

/** Step 2: land here from the email link → set session cookie → redirect home. */
auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  const email = c.req.query("email");
  if (!token || !email) {
    return c.redirect("/?error=invalid-link");
  }

  const db = c.env.WA_DB;
  const user = await consumeMagicToken(db, token);
  if (!user || user.email !== email) {
    return c.redirect("/?error=invalid-link");
  }

  const session = await createSession(db, user);
  setSessionCookie(c.res.headers, session, isSecure(c.req.url));
  return c.redirect("/", 302);
});

/** Current session identity. */
auth.get("/session", async (c) => {
  const cookies = parseCookies(c.req.raw.headers.get("cookie"));
  const user = await sessionUser(c.env.WA_DB, cookies[SESSION_COOKIE]);
  return c.json({ user: user ? { email: user.email, id: user.id } : null }, 200);
});

auth.post("/logout", async (c) => {
  const cookies = parseCookies(c.req.raw.headers.get("cookie"));
  await deleteSession(c.env.WA_DB, cookies[SESSION_COOKIE]);
  clearSessionCookie(c.res.headers, isSecure(c.req.url));
  return c.json({ ok: true });
});

function isSecure(url: string): boolean {
  return url.startsWith("https://");
}
