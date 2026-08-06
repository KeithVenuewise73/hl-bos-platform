import { describe, it, expect } from "vitest";
import { normalizeUrl, isBlockedIp, parseIpv4, isIpLiteral } from "./ssrf";

describe("normalizeUrl", () => {
  it("accepts a bare domain and defaults to https", () => {
    const v = normalizeUrl("example.com");
    expect(v.ok).toBe(true);
    expect(v.url?.protocol).toBe("https:");
    expect(v.url?.hostname).toBe("example.com");
  });

  it("accepts explicit http and https", () => {
    expect(normalizeUrl("http://example.com").ok).toBe(true);
    expect(normalizeUrl("https://example.com/path?q=1").ok).toBe(true);
  });

  it("rejects empty input", () => {
    expect(normalizeUrl("   ").ok).toBe(false);
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeUrl("ftp://example.com").ok).toBe(false);
    expect(normalizeUrl("file:///etc/passwd").ok).toBe(false);
    expect(normalizeUrl("gopher://x").ok).toBe(false);
  });

  it("rejects obvious internal hostnames", () => {
    expect(normalizeUrl("localhost").ok).toBe(false);
    expect(normalizeUrl("http://localhost:3000").ok).toBe(false);
    expect(normalizeUrl("service.internal").ok).toBe(false);
    expect(normalizeUrl("printer.local").ok).toBe(false);
    expect(normalizeUrl("metadata.google.internal").ok).toBe(false);
  });

  it("rejects private and loopback IP literals", () => {
    expect(normalizeUrl("http://127.0.0.1").ok).toBe(false);
    expect(normalizeUrl("http://10.1.2.3").ok).toBe(false);
    expect(normalizeUrl("http://192.168.0.1").ok).toBe(false);
    expect(normalizeUrl("http://169.254.169.254").ok).toBe(false); // cloud metadata
  });

  it("allows a public IP literal", () => {
    expect(normalizeUrl("http://8.8.8.8").ok).toBe(true);
  });
});

describe("parseIpv4", () => {
  it("parses valid dotted quads", () => {
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("255.255.255.255")).toBe(0xffffffff);
    expect(parseIpv4("1.2.3.4")).toBe(0x01020304);
  });
  it("rejects malformed input", () => {
    expect(parseIpv4("256.0.0.1")).toBeNull();
    expect(parseIpv4("1.2.3")).toBeNull();
    expect(parseIpv4("1.2.3.4.5")).toBeNull();
    expect(parseIpv4("a.b.c.d")).toBeNull();
  });
});

describe("isIpLiteral", () => {
  it("recognizes v4 and v6 literals but not hostnames", () => {
    expect(isIpLiteral("8.8.8.8")).toBe(true);
    expect(isIpLiteral("::1")).toBe(true);
    expect(isIpLiteral("[fe80::1]")).toBe(true);
    expect(isIpLiteral("example.com")).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("blocks IPv4 private / loopback / link-local / CGNAT / reserved", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.5.4",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback / ULA / link-local / mapped-private", () => {
    for (const ip of [
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12::9",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 and IPv4-mapped-public", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("refuses unrecognizable input rather than guessing", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});
