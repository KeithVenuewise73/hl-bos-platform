# 06 · UI Assessment

Three applications exist. There is deliberately **no customer-facing storefront or catalog UI yet** — the interfaces built so far serve the CEO and the first product.

---

## 1. CEO Development Control Center (`apps/control-center`)

**Class: EXECUTIVE TOOL. Maturity: Live (local-only by design).**

This is the permanent CEO interface and the embodiment of the operating contract: _no prompt may require the CEO to open a terminal, run Git, or perform an engineering task by hand._ It is a Next.js app launched by a single double-click (`scripts\control-center.bat`), running only on localhost because it drives `git` and the build system directly (exposing it publicly would be remote code execution).

**What it shows and does:**

- **Your decisions** — an approval queue built by _subtraction_: an item appears only when a human with authority must choose (connect an account, approve a PR whose checks all passed, resolve a CEO-owned blocker). An empty queue is the goal state.
- **Actions** — one-click build, test, quality-check, save, and send-to-GitHub.
- **Project status / Quality checks / Database** — live git state, quality gates, and Supabase migration state, all read-only.
- **Active development / Software portfolio / Release history / Morning brief** — honest status from `.hlbos/milestone.json` and the portfolio registry.

**The signature modules** (`src/lib`):

- `translate.ts` — turns raw engineering failure output into a CEO-readable explanation (headline, meaning, who owns it). Its rule table was built from _real_ failures hit while building the platform.
- `registry.ts` — the honest portfolio: a product only moves off "not-started" when it has code. It refuses to render a health bar for software that doesn't exist.
- `approvals.ts`, `milestone.ts`, `health.ts` — all built around "unknown is never dressed as green."

**Verdict:** mature and correct for its scope. **Leave it unchanged.** Its patterns (plain-English translation, honest empty states, approval-by-subtraction) are the right model for the _Enterprise Catalog interface_ that Phase II will need — reuse the approach, don't reinvent it.

## 2. HL-BTI app (`apps/hl-bti`)

**Class: PRODUCT MODULE. Maturity: Built, deployable.**

The authenticated, cloud-persistent front end for HL-BTI, the first product the Factory produced. It is the proof that the assembly model works: it **reuses HL-BOS wholesale** and re-implements none of it.

- **Auth & tenancy:** Supabase Auth + `identity.memberships`/`has_permission`. Invitation-only; no self-serve signup.
- **Data access:** only the five `public.bti_*` RPCs over the `bti` schema. The browser holds only a publishable key + the user's JWT; the service-role key is never used; RLS enforces everything.
- **Screens:** Sign-in → Workspace (tenant → businesses → **Intake** → **Business pane** run/save analysis → **Result**: BI profile, findings + recommendations, Executive Blueprint, proposal with pricing shown as "TBD" because pricing is a CEO decision).
- **Deployment shape:** static export served by nginx in a container (Herman Legacy Cloud / Coolify), per its `Dockerfile`.

**Verdict:** the strongest product UI in the estate and the template for future verticals — a thin, RLS-trusting client over permission-checked RPCs. Reuse this shape.

## 3. HL-BTI Alpha (`apps/hl-bti-alpha`)

**Class: PRODUCT MODULE (demo). Maturity: Built, offline.**

The same engine with **no backend** — an offline, browser-storage demo used for the EO-001 live demonstration. It maps its local store operations 1:1 to the future `bti.*` RPCs, so it's a faithful preview rather than a throwaway. It seeds Venuewise explicitly labelled as a _demonstration_, keeps pricing at 0 (never invented), and enforces the analysis-only cap. Screens include Analyze, Command Center, CEO Dashboard, Clients, and an Engagement container (Assessment Wizard, Scorecard, Blueprint Viewer, Proposal Viewer, Implementation, ROI Dashboard).

**Verdict:** useful for sales demos and design validation. It shares `@hl-bos/bti-engine` with the real app, so the two cannot drift on the math. Keep as a demo; it is not a second product.

## 4. What's deliberately missing

| Missing UI                        | Why it matters                                                       | Status                           |
| --------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| Customer-facing VisibilityAI app  | VisibilityAI is a DB/workflow prototype with no interface            | Absent (planned)                 |
| **Enterprise Catalog interface**  | The `hlvs` factory and discovery catalogs have no storefront/console | Absent — the key Phase II UI gap |
| Factory operator console          | The creation-order → conformance → build-package loop is DB-only     | Absent                           |
| Public sign-up / hosting decision | No customer onboarding surface; hosting not chosen                   | Absent (CEO decision)            |

## 5. Cross-cutting UI observations

- **Consistency of philosophy:** every app honors the anti-fabrication doctrine — empty states explain themselves, scores are honest, pricing is never invented. This is rare and valuable; preserve it in any new UI.
- **Thin clients, fat database:** all three apps push logic into the database/engine layer and keep the UI thin. This is why the same engine can back an online app and an offline demo without divergence.
- **Reuse path for the Catalog UI:** the Control Center's building blocks (`ui.tsx` cards/rows/empties, approval-by-subtraction, plain-English translation) plus the HL-BTI app's RPC-client shape are together a ready-made kit for the Enterprise Catalog console. Building it is composition, not a green-field UI project.
