import { describe, expect, it } from "vitest";

import {
  codeFromBytes,
  phoneAddresses,
  phoneUrl,
  SCENEFLOW_PORT,
  type NetworkAddress,
} from "./sceneflow-access";

describe("codeFromBytes", () => {
  it("is always six digits, leading zeros kept", () => {
    expect(codeFromBytes(() => 7)).toBe("000007");
    expect(codeFromBytes(() => 123_456)).toBe("123456");
    expect(codeFromBytes(() => 0)).toBe("000000");
  });

  it("rejects the tail of the range instead of taking a remainder", () => {
    // 16,000,001 is above the ceiling: a remainder would return "000001" and
    // make the low codes more likely than the high ones.
    const draws = [16_000_001, 16_777_215, 999_999];
    let i = 0;
    expect(codeFromBytes(() => draws[i++] ?? 0)).toBe("999999");
    expect(i).toBe(3);
  });

  it("refuses rather than returning a predictable code when the source is stuck", () => {
    expect(() => codeFromBytes(() => 16_777_215)).toThrow(/random source/);
  });
});

describe("phoneAddresses", () => {
  const ip = (
    address: string,
    extra: Partial<NetworkAddress> = {},
  ): NetworkAddress => ({
    address,
    family: "IPv4",
    internal: false,
    ...extra,
  });

  it("finds an ordinary home address", () => {
    expect(phoneAddresses({ "Wi-Fi": [ip("192.168.1.42")] })).toEqual(["192.168.1.42"]);
  });

  it("never offers loopback, because a phone typing it reaches itself", () => {
    expect(phoneAddresses({ lo: [ip("127.0.0.1", { internal: true })] })).toEqual([]);
  });

  it("ignores IPv6", () => {
    expect(phoneAddresses({ en0: [ip("fe80::1", { family: "IPv6" })] })).toEqual([]);
  });

  it("accepts node's numeric family, which older releases report", () => {
    expect(phoneAddresses({ en0: [ip("10.0.0.5", { family: "4" })] })).toEqual([
      "10.0.0.5",
    ]);
  });

  it("ignores a public address", () => {
    // If this machine had one, publishing it would be putting the photographs
    // on the internet.
    expect(phoneAddresses({ eth0: [ip("203.0.113.7")] })).toEqual([]);
  });

  it("ignores link-local, which means DHCP failed", () => {
    expect(phoneAddresses({ eth0: [ip("169.254.10.1")] })).toEqual([]);
  });

  it("ignores 172.32, which is outside the private range", () => {
    expect(phoneAddresses({ eth0: [ip("172.32.0.1")] })).toEqual([]);
    expect(phoneAddresses({ eth0: [ip("172.16.0.1")] })).toEqual(["172.16.0.1"]);
    expect(phoneAddresses({ eth0: [ip("172.31.255.254")] })).toEqual([
      "172.31.255.254",
    ]);
  });

  it("puts the likely home address first when virtual adapters are present", () => {
    const found = phoneAddresses({
      "vEthernet (WSL)": [ip("172.20.0.1")],
      Docker: [ip("10.10.0.1")],
      "Wi-Fi": [ip("192.168.0.14")],
    });
    expect(found[0]).toBe("192.168.0.14");
    expect(found).toHaveLength(3);
  });

  it("does not repeat an address reported on two adapters", () => {
    expect(phoneAddresses({ a: [ip("192.168.1.5")], b: [ip("192.168.1.5")] })).toEqual([
      "192.168.1.5",
    ]);
  });

  it("survives an adapter node reports as undefined", () => {
    expect(phoneAddresses({ ghost: undefined, "Wi-Fi": [ip("192.168.1.9")] })).toEqual([
      "192.168.1.9",
    ]);
  });

  it("rejects malformed addresses rather than building a broken URL", () => {
    expect(phoneAddresses({ x: [ip("192.168.1")] })).toEqual([]);
    expect(phoneAddresses({ x: [ip("192.168.1.999")] })).toEqual([]);
    expect(phoneAddresses({ x: [ip("192.168.one.1")] })).toEqual([]);
  });
});

describe("phoneUrl", () => {
  it("is plain http on SceneFlow's port", () => {
    expect(phoneUrl("192.168.1.42")).toBe(`http://192.168.1.42:${SCENEFLOW_PORT}`);
  });
});
