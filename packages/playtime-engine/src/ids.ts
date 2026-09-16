/**
 * Identifier generation.
 *
 * Ids are minted on the device, before any write is attempted, and they are
 * the same ids the database stores. That is what makes a retried sync safe:
 * the retry carries the id the first attempt carried, so the primary key --
 * not a guess about whether the first attempt landed -- decides whether the
 * row already exists.
 */

declare const globalThis: { crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T } };

const HEX = "0123456789abcdef";

/** RFC 4122 v4 identifier. Uses the platform CSPRNG wherever one exists. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    // No CSPRNG. This is a correctness fallback, not a security claim: these
    // ids are collision-avoidance keys for a single user's own game log, never
    // a secret, never a capability, never an authorization check.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  let out = "";
  for (let i = 0; i < 16; i++) {
    const b = bytes[i] as number;
    out += HEX[b >> 4];
    out += HEX[b & 0x0f];
    if (i === 3 || i === 5 || i === 7 || i === 9) out += "-";
  }
  return out;
}
