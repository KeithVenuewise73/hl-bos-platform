import { describe, expect, it } from "vitest";

import {
  awayAddresses,
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

describe("awayAddresses", () => {
  const ip = (
    address: string,
    extra: Partial<NetworkAddress> = {},
  ): NetworkAddress => ({
    address,
    family: "IPv4",
    internal: false,
    ...extra,
  });

  it("finds the address Tailscale gives this machine", () => {
    expect(awayAddresses({ Tailscale: [ip("100.101.102.103")] })).toEqual([
      "100.101.102.103",
    ]);
  });

  it("covers the whole 100.64.0.0/10 range and nothing either side of it", () => {
    expect(awayAddresses({ t: [ip("100.64.0.0")] })).toEqual(["100.64.0.0"]);
    expect(awayAddresses({ t: [ip("100.127.255.255")] })).toEqual(["100.127.255.255"]);
    expect(awayAddresses({ t: [ip("100.63.255.255")] })).toEqual([]);
    expect(awayAddresses({ t: [ip("100.128.0.0")] })).toEqual([]);
    expect(awayAddresses({ t: [ip("99.64.0.1")] })).toEqual([]);
    expect(awayAddresses({ t: [ip("101.64.0.1")] })).toEqual([]);
  });

  it("is empty when Tailscale is not installed, signed out, or stopped", () => {
    // All three look identical from here, and that is the point: an address
    // exists only when all three are true, which is the question being asked.
    expect(awayAddresses({ "Wi-Fi": [ip("192.168.1.42")], lo: [] })).toEqual([]);
  });

  it("never returns a home address, which does not work away from home", () => {
    expect(
      awayAddresses({
        "Wi-Fi": [ip("192.168.1.42")],
        Docker: [ip("172.17.0.1")],
        Tailscale: [ip("100.88.1.2")],
      }),
    ).toEqual(["100.88.1.2"]);
  });

  it("ignores loopback and IPv6", () => {
    expect(awayAddresses({ lo: [ip("100.100.100.100", { internal: true })] })).toEqual(
      [],
    );
    expect(awayAddresses({ t: [ip("fd7a:115c::1", { family: "IPv6" })] })).toEqual([]);
  });

  it("does not repeat an address reported twice", () => {
    expect(awayAddresses({ a: [ip("100.70.0.1")], b: [ip("100.70.0.1")] })).toEqual([
      "100.70.0.1",
    ]);
  });

  it("rejects malformed addresses rather than building a broken URL", () => {
    expect(awayAddresses({ t: [ip("100.64.0")] })).toEqual([]);
    expect(awayAddresses({ t: [ip("100.64.0.999")] })).toEqual([]);
  });
});

describe("home and away never overlap", () => {
  const ip = (address: string): NetworkAddress => ({
    address,
    family: "IPv4",
    internal: false,
  });

  it("no address is offered as both", () => {
    // The two lists mean different things to the person reading them -- "on
    // your Wi-Fi" and "anywhere" -- so an address appearing in both would be a
    // promise one of them cannot keep.
    const interfaces = {
      "Wi-Fi": [ip("192.168.1.42")],
      Tailscale: [ip("100.88.1.2")],
      Docker: [ip("172.17.0.1")],
      WSL: [ip("10.1.2.3")],
    };
    const home = phoneAddresses(interfaces);
    const away = awayAddresses(interfaces);
    expect(home.filter((a) => away.includes(a))).toEqual([]);
    expect(home).toContain("192.168.1.42");
    expect(away).toEqual(["100.88.1.2"]);
  });
});
