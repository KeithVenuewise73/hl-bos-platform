/**
 * Accounts, organizations and sessions for the local store.
 *
 * Email + password. Passwords are hashed with scrypt (N=16384, r=8, p=1, a
 * 16-byte salt) and compared in constant time. A session is a random
 * 32-byte token held in an HttpOnly cookie; only its SHA-256 is stored, so a
 * copy of the database cannot be replayed as a login.
 *
 * Signing up creates an organization with the new user as its owner. An
 * owner can add members from Settings. Every query in ./repo is scoped to
 * the organization in the session, which is how "users only see their
 * organization's photos" holds in this store.
 *
 * Magic links need an email service; none is connected, so there is no
 * magic-link button. Supabase Auth provides both (and social login) once
 * migration 0052 is applied — this module is what that replaces.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { newId, nowIso, type Db } from "./db-core.ts";

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || saltB64 === undefined || hashB64 === undefined)
    return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters for the password.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function normalizeEmail(email: string): string | null {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface SessionUser {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly role: "owner" | "member";
}

/** Create a user. With `organizationName`, also a new organization they own. */
export function createAccount(
  db: Db,
  input: {
    email: string;
    password: string;
    displayName: string;
    organizationName?: string;
    joinOrganizationId?: string;
  },
): { userId: string; organizationId: string } {
  const email = normalizeEmail(input.email);
  if (email === null) throw new AuthError("Enter a valid email address.");
  const problem = validatePassword(input.password);
  if (problem !== null) throw new AuthError(problem);
  const displayName = input.displayName.trim().slice(0, 80) || email;
  if (db.get("select 1 from users where email = :email", { email }) !== undefined) {
    throw new AuthError("An account with that email already exists.");
  }
  return db.tx(() => {
    const userId = newId();
    db.run(
      "insert into users (id, email, display_name, password_hash) values (:id, :email, :name, :hash)",
      { id: userId, email, name: displayName, hash: hashPassword(input.password) },
    );
    let organizationId: string;
    let role: "owner" | "member";
    if (input.joinOrganizationId !== undefined) {
      organizationId = input.joinOrganizationId;
      role = "member";
    } else {
      const name = (input.organizationName ?? "").trim().slice(0, 120);
      if (name.length === 0)
        throw new AuthError("Name your organization (a team, school or studio).");
      organizationId = newId();
      role = "owner";
      db.run("insert into organizations (id, name) values (:id, :name)", {
        id: organizationId,
        name,
      });
      db.run("insert into organization_settings (organization_id) values (:id)", {
        id: organizationId,
      });
    }
    db.run(
      "insert into memberships (organization_id, user_id, role) values (:org, :user, :role)",
      { org: organizationId, user: userId, role },
    );
    return { userId, organizationId };
  });
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Verify a password and open a session. Returns the raw token for the cookie. */
export function signIn(db: Db, emailInput: string, password: string): string {
  const email = normalizeEmail(emailInput) ?? "";
  const user = db.get<{ id: string; password_hash: string }>(
    "select id, password_hash from users where email = :email",
    { email },
  );
  // Hash anyway when the user does not exist, so timing does not reveal
  // which emails have accounts.
  const ok = verifyPassword(
    password,
    user?.password_hash ?? hashPassword("not-a-real-password"),
  );
  if (user === undefined || !ok)
    throw new AuthError("That email and password do not match.");
  const membership = db.get<{ organization_id: string }>(
    "select organization_id from memberships where user_id = :id order by created_at limit 1",
    { id: user.id },
  );
  if (membership === undefined)
    throw new AuthError("This account is not in an organization.");
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.run(
    "insert into sessions (token_hash, user_id, organization_id, expires_at) values (:h, :u, :o, :e)",
    { h: tokenHash(token), u: user.id, o: membership.organization_id, e: expires },
  );
  return token;
}

export function sessionUser(db: Db, token: string | undefined): SessionUser | null {
  if (token === undefined || token.length < 20) return null;
  const row = db.get<{
    user_id: string;
    email: string;
    display_name: string;
    organization_id: string;
    organization_name: string;
    role: "owner" | "member";
    expires_at: string;
  }>(
    `select s.user_id, u.email, u.display_name, s.organization_id, o.name as organization_name,
            m.role, s.expires_at
       from sessions s
       join users u on u.id = s.user_id
       join organizations o on o.id = s.organization_id
       join memberships m on m.user_id = s.user_id and m.organization_id = s.organization_id
      where s.token_hash = :h`,
    { h: tokenHash(token) },
  );
  if (row === undefined || row.expires_at < nowIso()) return null;
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
  };
}

export function signOut(db: Db, token: string | undefined): void {
  if (token === undefined) return;
  db.run("delete from sessions where token_hash = :h", { h: tokenHash(token) });
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;

/**
 * Sign-in throttle: five failures per email per 15 minutes. In memory, which
 * is right for a single local process; Supabase Auth has its own.
 */
const failures = new Map<string, number[]>();
export function throttled(email: string, now = Date.now()): boolean {
  const recent = (failures.get(email) ?? []).filter((t) => now - t < 15 * 60_000);
  failures.set(email, recent);
  return recent.length >= 5;
}
export function recordFailure(email: string, now = Date.now()): void {
  failures.set(email, [...(failures.get(email) ?? []), now]);
}
