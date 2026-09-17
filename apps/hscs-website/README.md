# @hl-bos/hscs-website

The public **HSCS marketing website** — Herman Supply Chain Solutions, _Transportation &
Operations Consulting_. It implements the approved **HSCS Commercial Launch Phase 1 Baseline**
(on `main` under `docs/products/`): the Commercial Foundation, Website IA, Homepage Content
Architecture, Homepage Copy, Website Page Specifications, and Design System.

## Scope

Delivered so far:

- the application scaffold (Next.js App Router, matching the other apps in this monorepo);
- the **Design System tokens implemented in code** (`src/app/globals.css` — CSS custom
  properties for color, type, spacing, radii, elevation, layout);
- the shared **header + responsive navigation** and **footer**;
- the **homepage** (sections S1–S11 from the approved Homepage Copy; S0 header / S12 footer in
  the layout);
- `/coming-soon` and a custom 404;
- the **services** hub and all eleven service pages, and the **industries** hub and five
  industry pages;
- the **Operations Assessment intake** — the site's single primary conversion — plus
  `/thank-you`.

It deliberately does **not** include: email, analytics, or any of the operational tools
(FleetHuddle, DispatchAI, TransportationAI, Government Logistics). Those tools appear on the
homepage only as _named enhancers that support consulting_ — never as products, never with a
CTA (Foundation §18). Still to build from the approved IA: `/experience`, `/method`,
`/insights`, `/guides`, `/about`, `/contact`, the legal pages, and `sitemap.xml` / `robots.txt`.

## The assessment intake

`/request-an-assessment` is a real, working form. It posts to a **server action** (no client
fetch, no Supabase SDK in the browser), which calls
`public.submit_operations_assessment_request` — added by migration **0048**. The publishable
key is read server-side and never reaches the browser, which is why the CSP keeps
`connect-src 'self'`.

Two rules the code enforces, both covered by tests:

- **No dead form.** If `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` are not both set, the page
  renders **no form at all** and says the intake is not connected. A form that cannot deliver
  is worse than none — it reads as a working front door and drops the request.
- **No invented success.** A visitor sees a thank-you only when the database returned a real
  reference matching `HSCS-OA-XXXXXXXX`. Every other outcome — unreachable, refused, an
  unexpected response shape — is reported as a failure that stored nothing. `/thank-you` will
  not echo a reference that is not in that exact shape.

Requires migration 0048 to be applied to the target project. It is written and tested but
**unapplied** — applying it is a separate CEO authorization.

No response-time promise appears anywhere on the page, because none has been approved.

## Honesty treatment of not-yet-built links

- **Navigation and secondary links** whose destination page is not built yet route to
  `/coming-soon`, which states the section is being prepared;
- **secondary CTAs that map to homepage sections** (lifecycle, method) use working on-page
  anchors;
- the credibility strip uses the **name-free** operating-record line, because the operating
  company names are experience (not endorsement) and must be permission-cleared before
  publication (Homepage Copy governance rule 2).

## Design tokens & typefaces

Tokens live as CSS custom properties in `src/app/globals.css` and are the single source of
values. The approved typefaces (Archivo / Inter / IBM Plex Mono) are referenced via CSS font
stacks with robust system fallbacks; **self-hosted webfonts are a follow-up** (Design System §3
notes "secure webfont hosting before launch") and are intentionally not bundled in this
milestone.

## Security headers & CSP

Static security headers are set in `next.config.ts`; the Content-Security-Policy is emitted
per-request with a fresh nonce from `src/middleware.ts` (nonce + `strict-dynamic`, no
`unsafe-inline` scripts), mirroring the Herman Legacy Digital pattern. The layout renders
dynamically so Next can apply the nonce to its framework scripts.

## Develop

```
pnpm --filter @hl-bos/hscs-website dev      # http://localhost:4600
pnpm --filter @hl-bos/hscs-website build
pnpm --filter @hl-bos/hscs-website test
```

Tests are pure Node unit tests (Vitest) over the content model (`src/lib/content.ts`) and the
navigation state logic (`src/lib/nav.ts`): they assert the homepage structure, the guiding
doctrine, the CTA rule, the "tools are not products" rule, the honesty rules, and the
open/close navigation behavior.
