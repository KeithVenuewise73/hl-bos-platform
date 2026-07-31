# Herman Legacy Digital · Release 1 — CEO Walkthrough

**For:** Keith Herman, CEO · **Author:** Claude · **Date:** 2026-07-31
Where every major capability — until now visible only in code and documents — now appears in a
real, navigable application. To run it locally: the app lives at `apps/herman-legacy-digital`
(`pnpm --filter @hl-bos/herman-legacy-digital dev`, port 4400).

## The public experience (no login)

| You visit                | You see                                                            | Powered by (existing)         |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------- |
| `/` (Home)               | Positioning, methodology (8 steps), focus markets, CTAs            | Marketing content             |
| `/transformation`        | How we transform businesses — the full methodology                 | HL-BTI methodology            |
| `/solutions`             | The product portfolio, grouped by category (public projection)     | Portfolio engine (Phase 2)    |
| `/industries`            | Logistics · Service · Sports, each with its solutions              | Portfolio                     |
| `/visibility-assessment` | The assessment intake form                                         | VisibilityAI + intake         |
| `/marketing`             | The Marketing & Growth offering                                    | Herman Legacy Marketing (3A)  |
| `/marketplace`           | Innovation Marketplace — public introduction (no internal metrics) | Portfolio (public projection) |
| `/resources`             | Reference implementations (honestly labeled, in progress)          | Reference engine (Phase 4)    |
| `/book`                  | Consultation intake                                                | Intake + workflow             |
| `/contact`               | How to start                                                       | Communications                |
| `/login`                 | Client login                                                       | HL-BOS identity               |

## The minimum working journey (end to end)

1. A **visitor** lands on Home and reads the methodology.
2. They open **Visibility Assessment** and submit the intake (business, contact, goals, consent).
3. The intake validates, preserves source attribution, and creates a **lead / assessment request**
   in the customer lifecycle — with an **honest confirmation** and reference (never a fake AI result).
4. A **client** signs in at `/login` → lands in the **Client Portal** (`/portal`).
5. The portal shows their engagement, roadmap, documents and recommendations — **real data or an
   honest no-data state**.
6. In the portal **Innovation Marketplace**, they see _Recommended for your transformation_,
   _Solutions in use_, and _Explore additional capabilities_ — where exploring only ever **requests
   a discussion**, never rewrites their advisor-set plan.

## Where each capability is now visible

| Capability (was code/docs only) | Now visible at                                   |
| ------------------------------- | ------------------------------------------------ |
| VisibilityAI                    | `/visibility-assessment` (the front door)        |
| HL-BTI transformation           | `/transformation` + portal roadmap               |
| Product portfolio / catalog     | `/solutions`, `/marketplace`, portal marketplace |
| Reference implementations       | `/resources`                                     |
| Customer lifecycle / CRM        | intake → lead record → `/portal`                 |
| Marketing & growth              | `/marketing`                                     |
| HL-BOS identity                 | `/login` → `/portal`                             |
| Analytics                       | events on every key action (`/api/event`)        |

## What is intentionally NOT done (awaiting your approval)

- **No production deployment, no DNS change** — the release candidate is built and validated; the
  runbook sequences the go-live after your authorization.
- **Live CRM delivery + analytics forwarding** are one env var each (documented) — off until you
  authorize the backend endpoints.
- **No fabricated results** anywhere — assessments are requests, portal data is real-or-empty,
  marketplace exposes no internal metrics, reference businesses are labeled honestly.

**Present the release candidate and await CEO approval before production deployment and DNS.**
