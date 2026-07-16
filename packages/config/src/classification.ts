/**
 * Environment variable classification.
 *
 * The Core v1 brief requires every variable to be classified, and requires
 * that private secrets are never prefixed with NEXT_PUBLIC. This module makes
 * that a machine-checked property rather than a documentation promise.
 */

/**
 * Where a variable is allowed to be read.
 *
 * - `browser-safe`    Shipped in the client bundle. Assume the whole world
 *                     can read it. Must be NEXT_PUBLIC_ prefixed.
 * - `server-only`     Server runtime only. Never in a client bundle.
 * - `ci-only`         Present in CI. Never at application runtime.
 * - `supabase-secret` Stored as a Supabase secret / Vault entry. Read by
 *                     Edge Functions, never by the Next.js server.
 * - `provider-secret` Third-party provider credential (Stripe, Twilio, AI
 *                     vendors). Server-only, and additionally must be
 *                     referenced through its provider abstraction.
 */
export type Classification =
  "browser-safe" | "server-only" | "ci-only" | "supabase-secret" | "provider-secret";

/** Classifications that must never appear in a browser bundle. */
export const SERVER_SIDE_CLASSIFICATIONS: readonly Classification[] = [
  "server-only",
  "ci-only",
  "supabase-secret",
  "provider-secret",
] as const;

export const BROWSER_PREFIX = "NEXT_PUBLIC_";

/**
 * Thrown when a variable's name contradicts its classification.
 *
 * This is deliberately a hard failure at startup rather than a warning. A
 * secret behind a NEXT_PUBLIC_ prefix is already compromised the moment it
 * builds; failing the boot is strictly better than shipping it.
 */
export class ConfigClassificationError extends Error {
  public override readonly name = "ConfigClassificationError";

  constructor(message: string) {
    super(message);
  }
}

/**
 * Assert that a variable's name is consistent with its classification.
 *
 * Two rules, both from the brief:
 *   1. "Never prefix private secrets with NEXT_PUBLIC."
 *   2. A browser-safe variable must be NEXT_PUBLIC_ prefixed, or Next.js
 *      will not expose it and it will silently be `undefined` at runtime.
 *
 * @throws {ConfigClassificationError} when the name and classification disagree.
 */
export function assertClassification(
  key: string,
  classification: Classification,
): void {
  const isPublicPrefixed = key.startsWith(BROWSER_PREFIX);
  const isServerSide = SERVER_SIDE_CLASSIFICATIONS.includes(classification);

  if (isPublicPrefixed && isServerSide) {
    throw new ConfigClassificationError(
      `"${key}" is classified "${classification}" but carries the ` +
        `${BROWSER_PREFIX} prefix, which makes it browser-visible. ` +
        `A secret exposed to the browser is a leaked secret. ` +
        `Remove the prefix, or reclassify it as "browser-safe" if it is ` +
        `genuinely public.`,
    );
  }

  if (!isPublicPrefixed && classification === "browser-safe") {
    throw new ConfigClassificationError(
      `"${key}" is classified "browser-safe" but lacks the ` +
        `${BROWSER_PREFIX} prefix. Next.js will not expose it to the client ` +
        `bundle, so it will be undefined in the browser at runtime.`,
    );
  }
}

/** True when the value must never cross into a browser bundle. */
export function isServerSide(classification: Classification): boolean {
  return SERVER_SIDE_CLASSIFICATIONS.includes(classification);
}
