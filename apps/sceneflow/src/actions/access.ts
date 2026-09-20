"use server";

import { cookies } from "next/headers";

import { ACCESS_COOKIE, codeMatches, deriveToken } from "@/lib/access";
import { guessAllowed, recordRightGuess, recordWrongGuess } from "@/lib/attempts";
import { configuredCode } from "@/lib/gate";
import { describeWait } from "@/lib/throttle";

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
 *
 * Wrong answers are slowed down here rather than in the page, because the page
 * is not where a guess arrives. A script calls this action directly, and a
 * delay that only exists in a form is no delay at all.
 */
export async function unlock(code: string): Promise<UnlockResult> {
  const configured = await configuredCode();
  if (configured === "") {
    return {
      ok: false,
      message: "No access code is set on this machine, so there is nothing to unlock.",
    };
  }

  // Checked BEFORE the code is compared. Checking afterwards would answer the
  // question the waiting is there to stop being answered.
  const gate = guessAllowed();
  if (!gate.allowed) {
    return { ok: false, message: describeWait(gate.waitMs) };
  }

  if (!codeMatches(configured, code)) {
    recordWrongGuess();
    return { ok: false, message: "That code does not match. Check the PC and retry." };
  }
  recordRightGuess();

  const store = await cookies();
  store.set(ACCESS_COOKIE, deriveToken(configured), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true, message: "Unlocked." };
}
