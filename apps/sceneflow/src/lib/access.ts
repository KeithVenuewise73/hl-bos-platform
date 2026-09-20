import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who is allowed to open SceneFlow.
 *
 * This exists because of one decision: SceneFlow can be reached from a phone.
 * The moment it stops listening only on this machine, everything else on the
 * home network can reach it too — a guest, a smart TV, anything that joined
 * the Wi-Fi — and what it would reach is somebody's private photographs. A
 * local-only tool needs no door. A tool on the network does.
 *
 * The rule is deliberately blunt: IF AN ACCESS CODE IS SET, IT IS REQUIRED,
 * from every address including this machine.
 *
 * The obvious alternative — "only ask for the code when the request came from
 * the network" — reads the Host header to decide, and anything on the network
 * can send `Host: localhost`. A check that an attacker can turn off is not a
 * check. So there is no exemption to get wrong.
 *
 * Pure on purpose: no files, no cookies, no request. The caller supplies what
 * it read, so every branch below is testable.
 */

export type AccessState =
  /** No code is set. The app is trusting whatever the operating system let in. */
  | { readonly state: "unguarded" }
  /** A code is set and this visitor has proved they know it. */
  | { readonly state: "open" }
  /** A code is set and this visitor has not. */
  | { readonly state: "locked"; readonly reason: string };

/**
 * Turn the code into the value that gets stored in the cookie.
 *
 * Not the code itself: a cookie is readable by anything with the file system,
 * and the same code is typed on the phone and on this machine. A hash means
 * the stored value cannot be typed back in as the code somewhere else.
 *
 * This is not password storage — there is no user database, one code, on one
 * machine, on a home network. It is a fixed-length token derived from a secret
 * the holder already had.
 */
export function deriveToken(code: string): string {
  return createHash("sha256").update(code.trim(), "utf-8").digest("hex");
}

/** Constant-time compare of two hex tokens. */
function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf-8");
  const right = Buffer.from(b, "utf-8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Tokens are always 64 hex characters, so a mismatch here is simply
  // wrong — answer false without comparing.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface AccessInput {
  /** The code read from disk. Empty means no code is set. */
  readonly configuredCode: string;
  /** The token this visitor presented, or empty. */
  readonly cookieToken: string;
}

export function decideAccess(input: AccessInput): AccessState {
  const code = input.configuredCode.trim();
  if (code === "") return { state: "unguarded" };

  const presented = input.cookieToken.trim();
  if (presented === "") {
    return { state: "locked", reason: "Enter the code shown on your PC." };
  }
  if (!sameToken(presented, deriveToken(code))) {
    return { state: "locked", reason: "That code does not match. Try again." };
  }
  return { state: "open" };
}

/** True when the visitor may see anything at all. */
export function isAllowed(state: AccessState): boolean {
  return state.state !== "locked";
}

/**
 * Does a typed code match?
 *
 * Separate from decideAccess because the unlock form has a code, not a token,
 * and comparing the two derived tokens keeps the comparison constant-time.
 */
export function codeMatches(configuredCode: string, typed: string): boolean {
  const code = configuredCode.trim();
  if (code === "") return false;
  return sameToken(deriveToken(typed), deriveToken(code));
}

/** The cookie the unlock form sets. Named so it is obvious in a browser. */
export const ACCESS_COOKIE = "sceneflow_access";
