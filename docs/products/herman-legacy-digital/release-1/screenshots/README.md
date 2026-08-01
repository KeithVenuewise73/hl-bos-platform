# Herman Legacy Digital · Release 1 — Screenshot Index

**Captured:** 2026-08-01 · **Source:** the real running app (`apps/herman-legacy-digital`,
port 4400), full-page renders at 1280×900 via Chromium.

These are **actual renders of the built application**, not mockups. The server was run locally
with `HLD_DEV_CLIENT=1` so the authenticated portal renders under a local dev-only client
identity (shown in-app as `dev-client@localhost`). That bypass is **impossible in production** —
it is gated off whenever `NODE_ENV` or `HL_BOS_ENV` is `production` — so it exists only to let
you see the portal shell without standing up live Supabase auth for a screenshot session.

| #   | File                            | Route                    | What it shows                                                                    |
| --- | ------------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| 01  | `01-home.png`                   | `/`                      | Positioning, methodology (8 steps), focus markets, CTAs                          |
| 02  | `02-about.png`                  | `/about`                 | Who Herman Legacy Digital is                                                     |
| 03  | `03-how-we-transform.png`       | `/transformation`        | The HL-BTI transformation methodology                                            |
| 04  | `04-solutions.png`              | `/solutions`             | Product portfolio grouped by category (public projection)                        |
| 05  | `05-industries.png`             | `/industries`            | Logistics · Service · Sports, each with its solutions                            |
| 06  | `06-visibility-assessment.png`  | `/visibility-assessment` | The VisibilityAI assessment intake form                                          |
| 07  | `07-marketing-growth.png`       | `/marketing`             | The Marketing & Growth offering                                                  |
| 08  | `08-innovation-marketplace.png` | `/marketplace`           | Innovation Marketplace public introduction (no internal metrics)                 |
| 09  | `09-resources.png`              | `/resources`             | Reference implementations, honestly labeled (in progress)                        |
| 10  | `10-client-login.png`           | `/login`                 | Client login (HL-BOS identity)                                                   |
| 11  | `11-client-portal.png`          | `/portal`                | The authenticated client portal (honest no-data + recommendations + marketplace) |
| 12  | `12-book-assessment.png`        | `/book`                  | Consultation intake                                                              |
| 13  | `13-contact.png`                | `/contact`               | How to start                                                                     |

**Not fabricated:** every panel that has no real data yet renders as an explicit no-data state,
not a filled-in example. See `04-ceo-review-build.md` for the classification of what is
Implemented / Placeholder / No-data / Deployment-gated in each view.
