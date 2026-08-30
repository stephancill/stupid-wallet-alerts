import { randomToken, sha256Hex } from "./lib/crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface User {
  id: string;
  email: string;
}

/** Get-or-create a user row by email. Returns the stable user id + email. */
export async function getUserByEmail(db: D1Database, email: string): Promise<User> {
  const existing = await db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string }>();
  if (existing) return existing;

  const id = `${Date.now()}${randomToken(8)}`;
  await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, email).run();
  return { id, email };
}

/** Issue a magic sign-in token (raw token returned, hashed at rest). */
export async function createMagicToken(db: D1Database, email: string): Promise<string> {
  const raw = randomToken();
  const expires = Date.now() + MAGIC_TTL_MS;
  await db
    .prepare("INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(raw), email, expires)
    .run();
  return raw;
}

/**
 * Redeem a magic token for a user. Returns the user (created if new) or null
 * when the token is unknown/expired/used.
 */
export async function consumeMagicToken(db: D1Database, rawToken: string): Promise<User | null> {
  const hash = await sha256Hex(rawToken);
  const row = await db
    .prepare("SELECT email, expires_at, used FROM magic_tokens WHERE token_hash = ?")
    .bind(hash)
    .first<{ email: string; expires_at: number; used: number }>();
  if (!row || row.used === 1 || row.expires_at < Date.now()) return null;

  await db.prepare("UPDATE magic_tokens SET used = 1 WHERE token_hash = ?").bind(hash).run();
  return getUserByEmail(db, row.email);
}

/** Create a session for a user; returns the raw session token for the cookie. */
export async function createSession(db: D1Database, user: User): Promise<string> {
  const raw = randomToken();
  const hash = await sha256Hex(raw);
  const id = randomToken(16);
  await db
    .prepare("INSERT INTO sessions (id, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)")
    .bind(id, hash, user.id, Date.now() + SESSION_TTL_MS)
    .run();
  return raw;
}

/** Resolve a raw session token to a user (or null). */
export async function sessionUser(
  db: D1Database,
  rawToken: string | undefined | null,
): Promise<User | null> {
  if (!rawToken) return null;
  const hash = await sha256Hex(rawToken);
  const row = await db
    .prepare(
      `SELECT u.id, u.email FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(hash, Date.now())
    .first<{ id: string; email: string }>();
  return row ?? null;
}

export async function deleteSession(
  db: D1Database,
  rawToken: string | undefined | null,
): Promise<void> {
  if (!rawToken) return;
  await db
    .prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256Hex(rawToken))
    .run();
}

/** Reap expired sessions + magic tokens (cheap cleanup; not on a hot path). */
export async function prune(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  await db.prepare("DELETE FROM magic_tokens WHERE expires_at <= ?").bind(Date.now()).run();
}
