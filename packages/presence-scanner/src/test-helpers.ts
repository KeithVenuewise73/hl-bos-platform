// Offline test doubles. Nothing here touches the network.

import type { FetchResult } from "../../../supabase/functions/_shared/discovery/scan.ts";
import type { WebEgress } from "./website.ts";

export const NOW = new Date("2026-10-14T15:00:00Z");

export interface FakeSite {
  status?: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
  redirectChain?: string[];
  finalUrl?: string;
  robots?: string;
  /** Throw from fetch (network failure). */
  throws?: string;
}

/**
 * An egress whose DNS answers a public address for every host in `sites` (and
 * the given private address for any host in `privateHosts`), and whose fetch
 * serves the fixture. Unknown hosts do not resolve.
 */
export function fakeEgress(
  sites: Record<string, FakeSite>,
  privateHosts: Record<string, string> = {},
): WebEgress & { fetched: string[] } {
  const fetched: string[] = [];
  const hostOf = (u: string) => new URL(u).hostname;
  const site = (u: string) => sites[hostOf(u)];
  return {
    fetched,
    resolve: (host) => {
      if (privateHosts[host]) return Promise.resolve([privateHosts[host]]);
      if (sites[host]) return Promise.resolve(["93.184.216.34"]);
      return Promise.reject(new Error(`getaddrinfo ENOTFOUND ${host}`));
    },
    fetchPage: (u): Promise<FetchResult> => {
      fetched.push(u);
      const s = site(u);
      if (!s) return Promise.reject(new Error(`getaddrinfo ENOTFOUND ${hostOf(u)}`));
      if (s.throws) return Promise.reject(new Error(s.throws));
      const body = s.body ?? "";
      return Promise.resolve({
        status: s.status ?? 200,
        finalUrl: s.finalUrl ?? u,
        redirectChain: s.redirectChain ?? [],
        headers: s.headers ?? {
          "content-type": s.contentType ?? "text/html; charset=utf-8",
        },
        body,
        bytes: body.length,
        contentType: s.contentType ?? "text/html; charset=utf-8",
      });
    },
    fetchRobots: (origin) => {
      const s = sites[new URL(origin).hostname];
      return Promise.resolve(
        s?.robots === undefined ? undefined : { status: 200, body: s.robots },
      );
    },
  };
}

/** A weak contractor homepage: HTTP-era basics missing, old footer. */
export const WEAK_CONTRACTOR_HTML = `<!doctype html><html><head><title>Home</title></head>
<body><h1>Smith Roofing</h1><p>Serving West Seneca since 1998.</p>
<p>Call us: 716-555-0101</p><footer>© 2019 Smith Roofing</footer></body></html>`;

/** A strong salon homepage: every path present. */
export const STRONG_SALON_HTML = `<!doctype html><html lang="en"><head>
<title>Bella Hair Studio | Hair Salon in Orchard Park, NY</title>
<meta name="description" content="Cuts, colour and blowouts in Orchard Park. Book online.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Bella Hair Studio">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"HairSalon","name":"Bella"}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script>gtag('config','G-1')</script>
</head><body>
<h1>Bella Hair Studio</h1>
<a href="tel:+17165550102">Call</a> <a href="mailto:hi@bella.example">Email</a>
<a href="https://www.vagaro.com/bellahair">Book Now</a>
<a href="/services">Services</a> <a href="/pricing">Pricing</a>
<iframe src="https://www.google.com/maps/embed?pb=xyz"></iframe>
<a href="https://www.instagram.com/bellahair">Instagram</a>
<form action="/contact"><input name="email"></form>
<footer>© ${NOW.getUTCFullYear()} Bella Hair Studio</footer>
</body></html>`;
