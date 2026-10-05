"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AuthError,
  createAccount,
  normalizeEmail,
  recordFailure,
  signIn,
  signOut,
  throttled,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-core.ts";
import { db } from "@/lib/db.ts";
import { cookieOptions, requireUser, SESSION_COOKIE } from "@/lib/session.ts";

const text = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

async function startSession(email: string, password: string): Promise<void> {
  const token = signIn(db(), email, password);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE_SECONDS));
}

export async function signUpAction(form: FormData): Promise<void> {
  const email = text(form, "email");
  const password = text(form, "password");
  try {
    createAccount(db(), {
      email,
      password,
      displayName: text(form, "name"),
      organizationName: text(form, "organization"),
    });
    await startSession(email, password);
  } catch (e) {
    const message =
      e instanceof AuthError ? e.message : "Could not create the account.";
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }
  redirect("/");
}

export async function signInAction(form: FormData): Promise<void> {
  const email = normalizeEmail(text(form, "email")) ?? text(form, "email");
  if (throttled(email)) {
    redirect(
      `/login?error=${encodeURIComponent("Too many attempts. Wait 15 minutes and try again.")}`,
    );
  }
  try {
    await startSession(email, text(form, "password"));
  } catch (e) {
    recordFailure(email);
    const message = e instanceof AuthError ? e.message : "Could not sign in.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  signOut(db(), jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
  redirect("/login");
}

export async function addMemberAction(form: FormData): Promise<void> {
  const user = await requireUser();
  if (user.role !== "owner")
    redirect(
      `/settings?error=${encodeURIComponent("Only the organization's owner can add people.")}`,
    );
  try {
    createAccount(db(), {
      email: text(form, "email"),
      password: text(form, "password"),
      displayName: text(form, "name"),
      joinOrganizationId: user.organizationId,
    });
  } catch (e) {
    redirect(
      `/settings?error=${encodeURIComponent(e instanceof AuthError ? e.message : "Could not add that person.")}`,
    );
  }
  redirect(
    `/settings?notice=${encodeURIComponent("Added. They can sign in with that email and password.")}`,
  );
}
