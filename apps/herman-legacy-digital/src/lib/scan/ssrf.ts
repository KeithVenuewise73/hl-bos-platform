// SSRF guard — the security boundary for the free Business Scan.
//
// A customer hands us a URL and we fetch it server-side. Left unguarded, that is
// a classic Server-Side Request Forgery vector: an attacker could point us at
// `http://169.254.169.254/…` (cloud metadata), `http://localhost/…` (internal
// services), or a private-range host and use our server as a proxy into the
// infrastructure. Everything here is PURE and unit-tested so the decision logic
// can be verified without a network. The live fetcher (fetch-site.ts) resolves
// DNS and re-checks every resolved IP and every redirect hop against these rules.
//
// Policy: only public, plain http/https URLs are allowed. Any address that
// resolves into a loopback, private, link-local, carrier-NAT, or otherwise
// non-global range is refused.

export interface UrlVerdict {
  ok: boolean;
  /** Present when ok: the normalized, safe-to-fetch URL. */
  url?: URL;
  /** Present when refused: a plain-language reason (safe to show a customer). */
  reason?: string;
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// Hostnames we refuse outright, before any DNS resolution.
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
]);

// Hostname suffixes that denote non-public networks.
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];

/**
 * Normalize raw customer input into a URL we are willing to consider.
 * Adds `https://` when no scheme is given (the common case — people type a bare
 * domain), rejects anything that is not plain http/https, and rejects hostnames
 * that are self-evidently internal. This does NOT prove the host is public — DNS
 * resolution in fetch-site.ts does that — it is the cheap first gate.
 */
export function normalizeUrl(raw: string): UrlVerdict {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Enter a website address." };

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That does not look like a valid website address." };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: "Only http and https addresses can be scanned." };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "That address has no host name." };
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "Internal addresses cannot be scanned." };
  }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "Internal addresses cannot be scanned." };
  }
  // A bare literal IP is allowed through normalization but must still pass the
  // numeric range check below (so `http://127.0.0.1` is refused here too).
  if (isIpLiteral(host)) {
    const ipVerdict = isBlockedIp(host);
    if (ipVerdict) {
      return { ok: false, reason: "That address points to a private network." };
    }
  }

  return { ok: true, url };
}

/** True when the string is a bare IPv4 or IPv6 literal (not a hostname). */
export function isIpLiteral(host: string): boolean {
  const h = stripBrackets(host);
  return parseIpv4(h) !== null || h.includes(":");
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

/**
 * The core check the live fetcher calls for EVERY address DNS returns. Returns
 * true when the IP must be refused (loopback / private / link-local / CGNAT /
 * reserved / multicast / unspecified). Accepts IPv4 and IPv6 literals.
 */
export function isBlockedIp(ip: string): boolean {
  const clean = stripBrackets(ip.trim().toLowerCase());

  const v4 = parseIpv4(clean);
  if (v4 !== null) return isBlockedIpv4(v4);

  if (clean.includes(":")) return isBlockedIpv6(clean);

  // Not a recognizable literal → refuse rather than guess.
  return true;
}

// ---- IPv4 -----------------------------------------------------------------

/** Parse dotted-quad IPv4 into a 32-bit int, or null if not valid IPv4. */
export function parseIpv4(s: string): number | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

function inRange(ip: number, cidrBase: string, bits: number): boolean {
  const base = parseIpv4(cidrBase)!;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isBlockedIpv4(ip: number): boolean {
  return (
    inRange(ip, "0.0.0.0", 8) || // "this" network / unspecified
    inRange(ip, "10.0.0.0", 8) || // private
    inRange(ip, "100.64.0.0", 10) || // carrier-grade NAT
    inRange(ip, "127.0.0.0", 8) || // loopback
    inRange(ip, "169.254.0.0", 16) || // link-local (incl. cloud metadata)
    inRange(ip, "172.16.0.0", 12) || // private
    inRange(ip, "192.0.0.0", 24) || // IETF protocol assignments
    inRange(ip, "192.0.2.0", 24) || // TEST-NET-1
    inRange(ip, "192.168.0.0", 16) || // private
    inRange(ip, "198.18.0.0", 15) || // benchmarking
    inRange(ip, "198.51.100.0", 24) || // TEST-NET-2
    inRange(ip, "203.0.113.0", 24) || // TEST-NET-3
    inRange(ip, "224.0.0.0", 4) || // multicast
    inRange(ip, "240.0.0.0", 4) // reserved (incl. 255.255.255.255 broadcast)
  );
}

// ---- IPv6 -----------------------------------------------------------------

function isBlockedIpv6(addr: string): boolean {
  const a = addr.split("%")[0]!; // drop any zone id

  if (a === "::" || a === "::1") return true; // unspecified / loopback

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — check the embedded v4.
  const mapped = a.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]!);
    if (v4 !== null) return isBlockedIpv4(v4);
  }

  const head = a.replace(/^\[/, "");
  return (
    head.startsWith("fe8") || // link-local fe80::/10
    head.startsWith("fe9") ||
    head.startsWith("fea") ||
    head.startsWith("feb") ||
    head.startsWith("fc") || // unique local fc00::/7
    head.startsWith("fd") ||
    head.startsWith("ff") // multicast ff00::/8
  );
}
