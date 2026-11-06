// Team galleries online — the code must not lean on Node globals.
//
// Supabase's Edge Runtime has no global `Buffer` (node:crypto and node:buffer
// work only when imported). The first live check of team-gallery found exactly
// that: "Buffer is not defined" on every password check and every publish,
// while these tests passed, because the runtime they run in provides the
// global. So this file removes it, as the Edge Runtime does, BEFORE the
// service code is loaded, and then does what the live service does.
//
//   deno test --no-check supabase/functions/tests/

import { createHash, randomBytes, scryptSync } from "node:crypto";

Reflect.deleteProperty(globalThis, "Buffer");

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("assertion failed: " + msg);
}

const { verifyPassword, issuePass, passIsValid, keyMatches } =
  await import("../_shared/gallery/core.ts");

function jerseySortHash(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
}

Deno.test("the test really runs without a global Buffer", () => {
  assert(
    typeof (globalThis as { Buffer?: unknown }).Buffer === "undefined",
    "Buffer is gone",
  );
});

Deno.test("checking a password works without a global Buffer", () => {
  const hash = jerseySortHash("goblue26");
  assert(verifyPassword("goblue26", hash) === true, "right password accepted");
  assert(verifyPassword("not-it", hash) === false, "wrong password refused");
});

Deno.test("access passes work without a global Buffer", () => {
  const gallery = {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "x",
    brand: "b",
    group_name: null,
    name: "n",
    password_hash: jerseySortHash("goblue26"),
  };
  const now = Date.now();
  const pass = issuePass("a-secret-of-at-least-32-characters-long", gallery, now);
  assert(
    passIsValid("a-secret-of-at-least-32-characters-long", gallery, pass, now),
    "valid pass",
  );
  assert(
    !passIsValid("a-different-secret-of-32-characters!!", gallery, pass, now),
    "wrong secret",
  );
});

Deno.test("the publisher's key is compared without a global Buffer", () => {
  const key = "a-publisher-key";
  const fingerprint = createHash("sha256").update(key).digest("hex");
  assert(keyMatches(key, fingerprint) === true, "the registered key matches");
  assert(keyMatches("another-key", fingerprint) === false, "another key does not");
});
