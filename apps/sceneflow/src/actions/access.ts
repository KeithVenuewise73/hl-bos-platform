"use server";

import { cookies } from "next/headers";

import { ACCESS_COOKIE, codeMatches, deriveToken } from "@/lib/access";
import { configuredCode } from "@/lib/gate";

export interface UnlockResult {
  readonly ok: boolean;
  readonly message: string;
}

/**
 * Take the code typed on the phone and, if it is right, remember this browser.
 *
 * The cookie is httpOnly so a page cannot read it back, and lax so it survives
 * following a link. It is deliberately NOT `secure`: this runs over plain HTTP
 * on a home network, and a `secure` cookie would simply never be stored, which
 * would look like the code being rejected forever.
 */
export async function unlock(code: string): Promise<UnlockResult> {
  const configured = await configuredCode();
  if (configured === "") {
    return {
      ok: false,
      message: "No access code is set on this machine, so there is nothing to unlock.",
    };
  }
  if (!codeMatches(configured, code)) {
    return { ok: false, message: "That code does not match. Check the PC and retry." };
  }

  const store = await cookies();
  store.set(ACCESS_COOKIE, deriveToken(configured), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true, message: "Unlocked." };
}
