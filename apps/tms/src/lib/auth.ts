import "server-only";

/**
 * Sign-in for the ISOLATED environment.
 *
 * Passwords are checked against auth.users.encrypted_password with
 * pgcrypto's crypt(), which is how Supabase GoTrue stores bcrypt hashes, so
 * the same accounts would verify there. In production this whole file is
 * replaced by Supabase Auth (a JWT whose `sub` is the same user id) — nothing
 * downstream changes, because every query already runs as that user id.
 *
 * The session cookie is `<user>.<expiry>.<hmac>`; it is verified on every
 * request and carries no other data.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./db.ts";
import { env } from "./env.ts";

export const SESSION_COOKIE = "tms_session";
const TTL_SECONDS = 12 * 3600;

export async function verifyPassword(
  email: string,
  password: string,
): Promise<string | null> {
  if (!email || !password || password.length > 200) return null;
  return db().superuser(async (c) => {
    const r = await c.query(
      `select id from auth.users
        where lower(email) = lower($1) and email_confirmed_at is not null
          and encrypted_password is not null
          and encrypted_password = extensions.crypt($2, encrypted_password)`,
      [email.trim(), password],
    );
    return (r.rows[0] as { id: string } | undefined)?.id ?? null;
  });
}

export async function emailOf(userId: string): Promise<string> {
  return db().superuser(async (c) => {
    const r = await c.query("select email from auth.users where id = $1", [userId]);
    return (r.rows[0] as { email: string } | undefined)?.email ?? "";
  });
}

function mac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signSession(
  userId: string,
  secret = env.sessionSecret,
  now = Date.now(),
): string {
  const payload = `${userId}.${Math.floor(now / 1000) + TTL_SECONDS}`;
  return `${payload}.${mac(payload, secret)}`;
}

export function readSession(
  token: string | undefined,
  secret = env.sessionSecret,
  now = Date.now(),
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts as [string, string, string];
  const want = Buffer.from(mac(`${user}.${exp}`, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) * 1000 < now) return null;
  return /^[0-9a-f-]{36}$/.test(user) ? user : null;
}
