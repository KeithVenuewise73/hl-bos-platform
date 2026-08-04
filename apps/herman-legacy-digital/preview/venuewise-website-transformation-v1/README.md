# Venuewise Website Preview — Transformation v1 (Not Live)

A **private, static, non-public** design preview of the proposed new Venuewise
website experience, built for **HLD internal review and possible Venuewise
client review**. It is a visual approval prototype — **not** the live Venuewise
website, and **not** connected to any production service.

> The live Venuewise website (the external `homehuddle` / "Venuewise Core"
> monorepo) was **not touched** by this work. This preview lives entirely inside
> the Herman Legacy Digital repository as static files.

## What it is

- Five self-contained static HTML pages + one shared stylesheet + one small
  safeguard script. No framework, no backend, no build step, no external fonts
  or assets (works offline; CSP-safe).
- Executes the approved **"Back to the Game"** theme and the approved Website
  Copy V1 (elevated/emotional version), with every unresolved item held to a
  visible `TO BE CONFIRMED` placeholder.

## Routes (open `index.html` in any browser)

| File                     | Page                        |
| ------------------------ | --------------------------- |
| `index.html`             | Homepage                    |
| `founding-families.html` | Founding Families           |
| `founding-partner.html`  | Founding Partner (4 tracks) |
| `organizations.html`     | Organizations & Clubs       |
| `coaches.html`           | Coaches                     |

## Safeguards (review-safe by construction)

- A persistent **"Venuewise Website Preview — Not Live"** ribbon on every page.
- `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` on
  every page, plus a `robots.txt` that disallows all crawling. No sitemap.
- **No production-domain canonical tag.** No production analytics, auth,
  checkout, subscription, intake, or notification calls.
- Every conversion CTA (Start Free / Request details / Become a…) is **inert**
  and shows a clear **"Preview — action not active"** notice on click
  (`preview.js`). Navigation links move only within the preview.
- No real customer data. No partner logos, testimonials, statistics, pricing,
  or integration claims — the only integration reference is the honest
  "works alongside the apps you already use," with sources placeheld.

## Reused vs. newly created

- **Reused (conventions/evidence):** the established isolated-preview pattern
  (`apps/hl-bti-alpha/preview/`), the repo screenshot-evidence convention
  (`docs/products/.../screenshots/`), and the approved Website Copy V1 content
  produced earlier this engagement.
- **Newly created (visual design):** an original, warm, Western-New-York
  sports design system — palette, system-serif headline treatment, layout,
  inline SVG icons, the calendar hero motif, and a plain text "Venuewise"
  wordmark. **No existing Venuewise brand assets, logos, fonts, or images were
  available in this repository, so none were copied or fabricated** — the
  wordmark is plain text and no third-party or partner logos appear.

## Unresolved placeholders (owner/CEO to confirm — not filled here)

- **Pricing after the founding period** (all pages).
- **Founding benefits & duration** (Families).
- **Founding Partner terms, pricing, exclusivity, advisory** (Partner /
  Organizations / Coaches).
- **Supported schedule sources at launch** (LeagueApps integration is evidenced
  internally; GameChanger/TeamSnap unverified — all shown as `TO BE CONFIRMED`).

## Review evidence

Screenshots in `./screenshots/`:

- Desktop (1280w): all five pages — `desktop-*.png`
- Mobile (390w): homepage, families, partner — `mobile-*.png`
- Tablet (834w): homepage — `tablet-homepage.png`

Regenerate: serve this directory over any static file server and screenshot with
a headless browser (the screenshots here were captured with headless Chromium at
the three viewports above).

## Status

Static preview only. **Not merged, not deployed, no DNS change, no production
connection, no client sharing initiated.** Awaiting HLD internal review.
