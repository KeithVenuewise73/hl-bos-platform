// The real Node egress adapter against a local server. The scanner's IP policy
// refuses loopback, so the positive-path tests pass a policy that admits only
// 127.0.0.1 -- the refusal tests use the real policy.

import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNodeEgress } from "./node-fetch.ts";
import { inspectWebsite } from "./website.ts";
import { NOW, STRONG_SALON_HTML } from "./test-helpers.ts";

let server: http.Server;
let port = 0;
const seenAgents: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seenAgents.push(String(req.headers["user-agent"]));
    switch (req.url) {
      case "/":
        res.writeHead(200, { "content-type": "text/html" }).end(STRONG_SALON_HTML);
        return;
      case "/robots.txt":
        res
          .writeHead(200, { "content-type": "text/plain" })
          .end("User-agent: *\nDisallow: /private");
        return;
      case "/gz":
        res
          .writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" })
          .end(zlib.gzipSync("<title>zipped page</title>"));
        return;
      case "/hop":
        res.writeHead(301, { location: "/" }).end();
        return;
      case "/to-metadata":
        res
          .writeHead(302, { location: "http://169.254.169.254/latest/meta-data" })
          .end();
        return;
      case "/loop":
        res.writeHead(302, { location: "/loop" }).end();
        return;
      case "/big":
        res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(50_000));
        return;
      case "/slow":
        setTimeout(() => res.writeHead(200).end("late"), 2000);
        return;
      default:
        res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

// "fixture.test" resolves to 127.0.0.1 through an injected lookup.
const lookup = ((
  _h: string,
  _o: unknown,
  cb: (e: Error | null, a: unknown, f?: number) => void,
) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never;
const onlyLoopback = (ip: string) => (ip === "127.0.0.1" ? null : "blocked_for_test");
const base = () => `http://fixture.test:${port}`;

// The scanner allows ports 80/443 only; the fixture runs on a random port, so
// these tests call the adapter directly rather than through runScan.
describe("Node egress adapter", () => {
  const eg = () =>
    createNodeEgress({
      lookup,
      ipBlocked: onlyLoopback,
      timeoutMs: 500,
      maxBytes: 10_000,
      extraPorts: [String(port)],
    });

  it("fetches a page, identifying itself honestly", async () => {
    const r = await eg().fetchPage(`${base()}/`);
    expect(r.status).toBe(200);
    expect(r.body).toContain("Bella Hair Studio");
    expect(r.redirectChain).toEqual([]);
    expect(seenAgents.at(-1)).toContain("HLG-PresenceScanner");
  });

  it("decompresses gzip", async () => {
    expect((await eg().fetchPage(`${base()}/gz`)).body).toBe(
      "<title>zipped page</title>",
    );
  });

  it("follows a redirect and records the chain", async () => {
    const r = await eg().fetchPage(`${base()}/hop`);
    expect(r.redirectChain).toEqual([`${base()}/`]);
    expect(r.finalUrl).toBe(`${base()}/`);
  });

  it("refuses a redirect into the cloud metadata address before requesting it", async () => {
    await expect(eg().fetchPage(`${base()}/to-metadata`)).rejects.toThrow(
      "ssrf_blocked:ip_link_local",
    );
  });

  it("stops a redirect loop", async () => {
    await expect(eg().fetchPage(`${base()}/loop`)).rejects.toThrow(
      "too_many_redirects",
    );
  });

  it("abandons a body over the byte cap and reports it as too large", async () => {
    const r = await eg().fetchPage(`${base()}/big`);
    expect(r.bytes).toBeGreaterThan(10_000);
    expect(r.body).toBe("");
  });

  it("times out a slow server", async () => {
    await expect(eg().fetchPage(`${base()}/slow`)).rejects.toThrow("timeout");
  });

  it("reads robots.txt", async () => {
    expect(await eg().fetchRobots(base())).toEqual({
      status: 200,
      body: "User-agent: *\nDisallow: /private",
    });
  });
});

describe("Node egress adapter with the real IP policy", () => {
  it("refuses at connect time a hostname that resolves to loopback (DNS rebinding)", async () => {
    const eg = createNodeEgress({ lookup, timeoutMs: 500, extraPorts: [String(port)] });
    await expect(eg.fetchPage(`${base()}/`)).rejects.toThrow(
      "ssrf_blocked:dns_loopback",
    );
  });

  it("refuses an IP-literal private address outright", async () => {
    const eg = createNodeEgress({ timeoutMs: 500 });
    await expect(eg.fetchPage("http://127.0.0.1/")).rejects.toThrow(
      "ssrf_blocked:ip_loopback",
    );
    await expect(eg.fetchPage("http://10.1.2.3/")).rejects.toThrow(
      "ssrf_blocked:ip_private",
    );
  });

  it("through the full inspection, a loopback-resolving site is 'blocked', never fetched", async () => {
    const eg = createNodeEgress({ lookup, timeoutMs: 500 });
    const before = seenAgents.length;
    const r = await inspectWebsite("http://fixture.test/", eg, NOW);
    expect(r.status).toBe("blocked");
    expect(seenAgents.length).toBe(before);
  });
});
