// The production egress adapter for Node (the Control Center's server).
//
// The existing scanner (scan.ts) validates the target and every redirect hop
// AFTER the fetch, from the redirect chain. This adapter adds the half that the
// edge worker leaves "for a deployed build" -- defence at connect time:
//
//   * redirects are followed manually, and each hop is validated (scheme,
//     credentials, port, host, resolved IPs) BEFORE it is requested;
//   * the socket's own DNS lookup is wrapped, so the address actually dialled
//     is checked against the private/loopback/metadata block list -- a DNS
//     answer that changes between check and connect (rebinding) is refused;
//   * the body is read up to a byte cap and abandoned beyond it;
//   * every request has a timeout and identifies itself honestly.
//
// It reuses url.ts (validateUrl, validateRedirect, ipBlockedReason) unchanged.

import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import {
  ipBlockedReason,
  SsrfError,
  validateRedirect,
  validateUrl,
} from "../../../supabase/functions/_shared/discovery/url.ts";
import type { FetchResult } from "../../../supabase/functions/_shared/discovery/scan.ts";
import { SCANNER_USER_AGENT } from "./robots.ts";
import type { WebEgress } from "./website.ts";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /**
   * The IP policy. Defaults to the scanner's block list. Tests substitute a
   * policy that admits 127.0.0.1 so a local fixture server can be reached;
   * nothing in the application passes this.
   */
  ipBlocked?: (ip: string) => string | null;
  /** DNS lookup, injectable for tests. */
  lookup?: typeof dns.lookup;
  /** Ports allowed besides the default 80/443. Tests only (a fixture's random port). */
  extraPorts?: string[];
}

const DEFAULTS = { timeoutMs: 10_000, maxBytes: 5_000_000, maxRedirects: 5 };

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  bytes: number;
}

export function createNodeEgress(opts: SafeFetchOptions = {}): WebEgress {
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxBytes = opts.maxBytes ?? DEFAULTS.maxBytes;
  const maxRedirects = opts.maxRedirects ?? DEFAULTS.maxRedirects;
  const blocked = opts.ipBlocked ?? ipBlockedReason;
  const baseLookup = opts.lookup ?? dns.lookup;
  const urlOpts = opts.extraPorts?.length
    ? { allowedPorts: new Set(["", "80", "443", ...opts.extraPorts]) }
    : {};

  // Connect-time guard: whatever address the socket is about to dial is checked.
  const guardedLookup: LookupFunction = (hostname, options, callback) => {
    baseLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 4);
      const list: dns.LookupAddress[] = Array.isArray(addresses) ? addresses : [];
      for (const a of list) {
        const reason = blocked(a.address);
        if (reason) return callback(new SsrfError(`dns_${reason}`), "", 4);
      }
      if (list.length === 0) return callback(new SsrfError("dns_no_records"), "", 4);
      if (options.all) return callback(null, list);
      const first = list[0]!;
      callback(null, first.address, first.family);
    });
  };

  const resolve = (host: string): Promise<string[]> =>
    new Promise((res, rej) => {
      baseLookup(host, { all: true }, (err, addresses) => {
        if (err) return rej(err);
        res(addresses.map((a) => a.address));
      });
    });

  const once = (url: URL, accept: string): Promise<RawResponse> =>
    new Promise((res, rej) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(
        url,
        {
          method: "GET",
          // A fresh connection per request: a pooled keep-alive socket would
          // skip the lookup below, and with it the connect-time IP check.
          agent: false,
          lookup: guardedLookup,
          timeout: timeoutMs,
          headers: {
            "user-agent": SCANNER_USER_AGENT,
            accept,
            "accept-encoding": "gzip, deflate, br",
          },
        },
        (resp) => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(resp.headers))
            if (v !== undefined)
              headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          let stream: NodeJS.ReadableStream = resp;
          const enc = (headers["content-encoding"] ?? "").toLowerCase();
          if (enc === "gzip") stream = resp.pipe(zlib.createGunzip());
          else if (enc === "deflate") stream = resp.pipe(zlib.createInflate());
          else if (enc === "br") stream = resp.pipe(zlib.createBrotliDecompress());
          const chunks: Buffer[] = [];
          let bytes = 0;
          let over = false;
          stream.on("data", (c: Buffer) => {
            bytes += c.length;
            if (bytes > maxBytes) {
              over = true;
              req.destroy();
              return;
            }
            chunks.push(c);
          });
          const done = () =>
            res({
              status: resp.statusCode ?? 0,
              headers,
              body: over ? "" : Buffer.concat(chunks).toString("utf8"),
              // Reported past the cap so scan.ts fails it as response_too_large.
              bytes: over ? maxBytes + 1 : bytes,
            });
          stream.on("end", done);
          stream.on("close", () => {
            if (over) done();
          });
          stream.on("error", (e: Error) => (over ? done() : rej(e)));
        },
      );
      req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs} ms`)));
      req.on("error", rej);
      req.end();
    });

  /** Follow redirects manually, validating each hop before requesting it. */
  const follow = async (raw: string, accept: string): Promise<FetchResult> => {
    let current = validateUrl(raw, urlOpts);
    const chain: string[] = [];
    for (;;) {
      const r = await once(current, accept);
      const loc = r.headers["location"];
      if (r.status >= 300 && r.status < 400 && loc) {
        if (chain.length >= maxRedirects) throw new SsrfError("too_many_redirects");
        const nextUrl = validateRedirect(loc, current.toString(), urlOpts);
        chain.push(nextUrl.toString());
        current = nextUrl;
        continue;
      }
      return {
        status: r.status,
        finalUrl: current.toString(),
        redirectChain: chain,
        headers: r.headers,
        body: r.body,
        bytes: r.bytes,
        contentType: r.headers["content-type"] ?? "",
      };
    }
  };

  return {
    resolve,
    // DNS only: resolving two well-known public names proves the computer is
    // online without fetching anything from them.
    online: async () => {
      for (const host of ["www.google.com", "one.one.one.one"]) {
        try {
          if ((await resolve(host)).length) return true;
        } catch {
          // try the next one
        }
      }
      return false;
    },
    fetchPage: (url) => follow(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"),
    fetchRobots: async (origin) => {
      try {
        const r = await follow(`${origin}/robots.txt`, "text/plain,*/*;q=0.1");
        if (r.bytes > 500_000) return undefined;
        return { status: r.status, body: r.status === 200 ? r.body : "" };
      } catch {
        return undefined;
      }
    },
  };
}
