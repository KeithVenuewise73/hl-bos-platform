import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { sessionUser, type SessionUser } from "./auth-core.ts";
import { config } from "./config.ts";
import { db } from "./db.ts";

export const SESSION_COOKIE = "jerseysort_session";

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return sessionUser(db(), jar.get(SESSION_COOKIE)?.value);
}

/** For pages and actions: the signed-in user, or a redirect to sign in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (user === null) redirect("/login");
  return user;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config().secureCookies,
    path: "/",
    maxAge,
  };
}
