// A local web server that impersonates several kinds of website, chosen by the
// Host header. Synthetic content only; it listens on 127.0.0.1 and is reached
// through made-up *.test host names. It records every request it receives, so
// tests can prove what the browser did NOT do (submit, retry, keep asking).

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Hit {
  host: string;
  method: string;
  path: string;
}

const page = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${head}</head><body>${body}</body></html>`;

const lorem =
  "Our rink offers year-round ice for families, schools and teams across Western New York. ".repeat(
    6,
  );

function rinkSite(port: number, path: string, prefix: string): [number, string] {
  const nav = `<header><a href="/">Example Rinks</a>
    <button aria-label="Open menu" aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.getElementById('nav').style.display='block'">☰</button>
    <nav id="nav"><a href="/">Home</a><a href="/programs">Programs</a><a href="/public-skating">Public Skating</a><a href="/contact">Contact</a>${prefix === "partial" ? '<a href="/members">Members</a><a href="/schedule">Schedule</a>' : ""}<a href="http://booking.test:${port}/register">Register</a></nav></header>`;
  const track = `<script>fetch('/track', { method: 'POST', body: 'x' }).catch(() => {});</script>`;
  switch (path) {
    case "/":
      return [
        200,
        page(
          "Example Rinks — Ice skating in Buffalo",
          `${nav}<h1>Ice for everyone</h1><p>${lorem}</p><a href="tel:+17165550199">Call 716-555-0199</a><form method="post" action="/contact-submit"><label for="n">Name</label><input id="n" name="name"><input type="email" placeholder="Email"><button>Send</button></form>${track}`,
        ),
      ];
    case "/programs":
      return [
        200,
        page(
          "Programs — Learn to Skate and Hockey",
          `${nav}<h1>Programs</h1><h2>Learn to Skate</h2><p>${lorem}</p><a href="http://booking.test:${port}/register">Register now</a>`,
        ),
      ];
    case "/public-skating":
      return [
        200,
        page("Public Skating", `${nav}<h1>Public Skating Schedule</h1><p>${lorem}</p>`),
      ];
    case "/contact":
      return [
        200,
        page(
          "Contact us",
          `${nav}<h1>Contact</h1><a href="mailto:info@example.test">info@example.test</a><p>${lorem}</p>`,
        ),
      ];
    case "/members":
      return [200, page("Members", `${nav}<p>${lorem}</p>`)];
    case "/schedule":
      return [
        prefix === "partial" ? 429 : 200,
        page("Schedule", `${nav}<p>${lorem}</p>`),
      ];
    default:
      return [404, page("Not found", "<h1>Not found</h1>")];
  }
}

export interface FixtureServer {
  port: number;
  hits: Hit[];
  url: (host: string, path?: string) => string;
  close: () => Promise<void>;
}

export async function startFixtureSites(): Promise<FixtureServer> {
  const hits: Hit[] = [];
  let port = 0;
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0] ?? "";
    const p = (req.url ?? "/").split("?")[0] ?? "/";
    hits.push({ host, method: req.method ?? "GET", path: p });
    const send = (
      status: number,
      body: string,
      headers: Record<string, string> = {},
    ) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(body);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(200, "accepted");
    if (p === "/robots.txt") {
      if (host === "partial.test")
        return send(200, "User-agent: *\nDisallow: /members\nDisallow: /programs\n", {
          "content-type": "text/plain",
        });
      return send(404, "");
    }
    switch (host) {
      case "rinks.test":
      case "partial.test": {
        const [s, b] = rinkSite(port, p, host === "partial.test" ? "partial" : "rinks");
        return send(s, b);
      }
      case "booking.test":
        return send(
          200,
          page(
            "Register — Example Booking",
            `<h1>Choose a session</h1><p>${lorem}</p><form method="post" action="/pay"><input name="card"><button>Pay</button></form>`,
          ),
        );
      case "spa.test":
        return send(
          200,
          page(
            "Example Rinks",
            `<div id="root"></div><script>document.getElementById('root').innerHTML = '<nav><a href="/programs">Programs</a><a href="/contact">Contact</a></nav><h1>Welcome to the rink</h1><p>' + 'Skating lessons, hockey leagues and birthday parties all year round. '.repeat(20) + '</p>';</script>`,
          ),
        );
      case "cf.test":
        return send(
          403,
          page(
            "Attention Required! | Cloudflare",
            "<h1>Sorry, you have been blocked</h1><p>You are unable to access example.test</p><p>Cloudflare Ray ID: 0</p>",
          ),
        );
      case "challenge.test":
        return send(
          200,
          page("Just a moment...", "<p>Enable JavaScript and cookies to continue</p>"),
        );
      case "wide.test":
        return send(
          200,
          page(
            "Wide Rink",
            `<nav><a href="/">Home</a></nav><h1>Wide</h1><div style="width:1200px">${lorem}</div>`,
          ),
        );
      default:
        return send(404, page("Not found", "<h1>Not found</h1>"));
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as AddressInfo).port;
  return {
    port,
    hits,
    url: (host, path = "/") => `http://${host}:${port}${path}`,
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}

/** robots.txt over plain HTTP to the fixture, with the right Host header. */
export function fixtureRobots(port: number) {
  return (origin: string) =>
    new Promise<{ status: number; body: string } | undefined>((ok) => {
      const host = new URL(origin).hostname;
      const req = http.get(
        { host: "127.0.0.1", port, path: "/robots.txt", headers: { host } },
        (res) => {
          let body = "";
          res.on("data", (c: Buffer) => (body += c.toString()));
          res.on("end", () => ok({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", () => ok(undefined));
    });
}
