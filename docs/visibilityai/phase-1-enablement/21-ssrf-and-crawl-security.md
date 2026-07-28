# Phase 1 · Deliverable 3 (CP5) — SSRF and Crawl Security Report

**Date:** 2026-07-27 · **Checkpoint:** 5 · Security designed in from the first line, not bolted on.

The Website Assessment Collector fetches attacker-influenced URLs. Server-Side Request Forgery (SSRF) is therefore the primary threat: a hostile or careless target could try to make our infrastructure reach internal services, cloud metadata endpoints, or non-HTTP protocols. Every defense below lives in `supabase/functions/_shared/discovery/url.ts` and is enforced by `scan.ts` on the **target and every redirect hop**.

## 1. Threat model

| Threat                                                    | Defense                                                              | Where                              |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Non-HTTP scheme (`file:`, `gopher:`, `data:`)             | Scheme allowlist `{http, https}`                                     | `validateUrl`                      |
| Credentials in URL (`user:pass@host`)                     | Reject `username`/`password`                                         | `validateUrl`                      |
| Non-web port (`:22`, `:6379`, `:8080`)                    | Port allowlist `{"", 80, 443}`                                       | `validateUrl`                      |
| Direct private/loopback/link-local IP literal             | IPv4 + IPv6 range classifier, rejected before any I/O                | `ipBlockedReason`                  |
| Cloud metadata (`169.254.169.254`)                        | Covered by `169.254.0.0/16` link-local block                         | `ipBlockedReason`                  |
| Internal hostnames (`localhost`, `*.local`, `*.internal`) | Hostname suffix rejection                                            | `validateUrl`                      |
| **DNS rebinding** (public name → private A record)        | Resolve the host and reject if **any** returned IP is blocked        | `resolveAndValidate`               |
| Redirect to a private target                              | Re-validate structure **and** re-resolve **every** redirect hop      | `scan.ts` + `validateRedirect`     |
| Redirect loop / chain abuse                               | `maxRedirects = 5`                                                   | `scan.ts`                          |
| Resource exhaustion (huge body)                           | `maxBytes = 5,000,000`                                               | `scan.ts`                          |
| Content smuggling (non-HTML)                              | `allowedContentTypes = ["text/html"]`                                | `scan.ts`                          |
| Secret leakage in errors/logs                             | `redact()` scrubs every error string before it is stored or returned | `scan.ts` + `_shared/ai/redact.ts` |

## 2. Blocked IP ranges

**IPv4** (`ipv4Blocked`): `0.0.0.0/8` (unspecified), `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private), `127.0.0.0/8` (loopback), `169.254.0.0/16` (link-local, incl. metadata), `100.64.0.0/10` (CGNAT), `192.0.0.0/24` (special), `198.18.0.0/15` (benchmark), `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved).

**IPv6** (`ipv6Blocked`): `::1` (loopback), `::` (unspecified), `fe80::/10` (link-local), `fc00::/7` (unique-local), and IPv4-mapped/embedded addresses (`::ffff:a.b.c.d`) reclassified through the IPv4 rules.

## 3. Defense-in-depth: resolve, then re-validate at connect time

`resolveAndValidate` is the rebinding defense: it rejects a hostname whose DNS answer contains any blocked address, and treats an **empty** answer as a failure (`dns_no_records`), never an implicit allow. Because DNS can change between resolution and connection (TOCTOU), the production `fetchPage` adapter must **pin** the validated IP or re-validate the socket peer at connect time. This is documented as a hard requirement on the deployment adapter; the offline core proves the logic with an injected resolver.

## 4. Robots & crawl conduct

The collector is a courteous crawler. In the deployed adapter (CEO-gated): honor `robots.txt`, send a truthful descriptive `User-Agent`, request one page per assessment in this module (single-page technical assessment), and respect the byte/redirect budgets above. No aggressive crawling, no authentication bypass, no scraping behind login. The single-page scope keeps the blast radius minimal for the first module.

## 5. Test coverage (all passing, offline)

`supabase/functions/tests/discovery_website.test.ts` proves each control:

- Public URL accepted; private/loopback/link-local/metadata/CGNAT IPs rejected.
- Non-HTTP scheme, embedded credentials, dangerous ports, internal hostnames rejected.
- DNS rebinding rejected (single private answer, and a poisoned answer mixed with public ones).
- Redirect-to-private rejected; over-limit redirect chain rejected.
- Over-size response and non-HTML content-type rejected.
- Fetch/validation errors are redacted (no secret leak).

30 assertions pass under the offline harness. The same file runs as `deno test` in CI.

## 6. Residual risk (stated plainly)

The offline core cannot prove the **connect-time** IP pin — that lives in the not-yet-written production `fetchPage` adapter. Until that adapter exists and is reviewed, the collector must not be pointed at real targets. This is the single most important gate before any live scan, and it is called out again in the [Known Limitations Report](27-known-limitations.md).
