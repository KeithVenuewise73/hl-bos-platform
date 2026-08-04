# HLD Business Transformation Intelligence Center (BTIC) — V1

The **Business Transformation Intelligence Center** is HLD's internal executive
workspace and institutional memory for transformation engagements. It answers, at
a glance and in one place:

- Where does the engagement stand, and what is complete?
- Which report is the **current truth**, and what historical versions exist?
- What executive **decisions** are still owed?
- What has HLD **learned** — and what is still an explicit gap?
- Which concrete **artifacts** (PRs, documents, previews) did the work produce?

V1 ships one seeded dossier — the **Venuewise Transformation Dossier** — built
**only from verified internal materials**. It is a **read / review** workspace. It
is not a CRM, not an analytics product, and it does not yet capture new records
from the UI (see [Why no database migration in V1](#why-no-database-migration-in-v1)).

It lives **inside the existing Herman Legacy Digital application** at the internal
route **`/intelligence`** — it is not a new app.

---

## The seven views

| #   | View                | Route                                       | Answers                                           |
| --- | ------------------- | ------------------------------------------- | ------------------------------------------------- |
| 1   | Executive Home      | `/intelligence`                             | Which engagements exist and where each stands     |
| 2   | Engagement Overview | `/intelligence/venuewise`                   | The one-screen summary + bounded search           |
| 3   | Timeline            | `/intelligence/venuewise/timeline`          | Every phase, in order, with sources               |
| 4   | Reports             | `/intelligence/venuewise/reports`           | Current truth vs. retained history, per subject   |
| 4b  | Report detail       | `/intelligence/venuewise/reports/[subject]` | One current truth + full version history          |
| 5   | Decisions           | `/intelligence/venuewise/decisions`         | What the owner/CEO must decide, and why it blocks |
| 6   | Artifacts           | `/intelligence/venuewise/artifacts`         | The concrete deliverables and where they live     |
| 7   | Intelligence        | `/intelligence/venuewise/intelligence`      | What HLD learned, with confidence + source        |

Screenshots of every view are in [`./screenshots/`](./screenshots/).

---

## The bounded V1 data model (six entities)

All in [`apps/herman-legacy-digital/src/lib/btic-data.ts`](../../../apps/herman-legacy-digital/src/lib/btic-data.ts)
as a typed content-as-data module (same pattern as `portal-data.ts`).

1. **Transformation Engagement** — the engagement itself (status, current phase,
   optional deterministic transformation score).
2. **Phase** — an ordered stage of the engagement (`complete` / `in_progress` /
   `not_started`).
3. **Report** — a deliverable with a **version lifecycle**:
   `draft → current → approved` and, once replaced, `superseded` / `archived`.
   Reports that share a `subject` form one version lineage.
4. **Executive Decision** — a decision owed by the owner/CEO (`pending` /
   `resolved`), with what it **blocks** and what is verified vs. to-be-confirmed.
5. **Artifact Reference** — a concrete output (PR, repository document, preview),
   referenced by repo path / PR number — never a fabricated external URL.
6. **Intelligence Record** — something HLD learned, tagged with **confidence**:
   `verified` (traced to repo evidence), `reported` (stated internally,
   unconfirmed), or `unknown` (an explicit gap, recorded so it is never mistaken
   for a known fact).

**Every record carries a `provenance` field** naming where the fact came from.
Nothing is invented. This is enforced by a unit test.

### Current truth vs. history (the versioning rule)

- `currentReportFor(subject)` returns the **single** `current`/`approved` report
  for a subject. It never returns a superseded, draft, or archived version.
- `historyFor(subject)` returns the **entire** lineage, current-first — superseded
  versions are **retained, never deleted or overwritten**.
- `reportTruthIsUnambiguous(subject)` guards the invariant that exactly one
  accepted version exists per subject; the UI shows a visible warning if it is
  ever violated.

The Venuewise dossier demonstrates this with the website copy: the **first draft**
is retained as `superseded`, and the **elevated revision** is the `current` truth
that supersedes it.

---

## Reuse matrix — assemble, do not rebuild

BTIC V1 is composed almost entirely from what HLD already has.

| Capability                             | Reused from                                                                   | New in BTIC V1                              |
| -------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Identity / authentication              | HL-BOS Supabase Auth via `lib/session.ts` (publishable key only, fail-closed) | —                                           |
| Route gating                           | `middleware.ts` (extended: `/portal` **+ `/intelligence`**)                   | One prefix added                            |
| Local dev bypass (never in prod)       | `lib/access.ts` `devBypassEnabled`                                            | —                                           |
| Visual system / palette                | `components/ui.tsx` (`colors`)                                                | BTIC shell + badges (`components/btic.tsx`) |
| Content-as-data pattern                | `lib/portal-data.ts`                                                          | `lib/btic-data.ts` (6-entity dossier)       |
| Honest no-data / provenance discipline | Portal Release-1 conventions                                                  | Per-record `provenance`, confidence tags    |
| Deterministic assessment (47/100)      | `docs/products/hl-bti-consulting/09-venuewise-internal-case-study.md`         | Displayed, not recomputed                   |
| Engagement evidence                    | Venuewise capability/backend harvest docs; reference-implementation doc       | Summarized as intelligence records          |
| Artifact provenance                    | PR #29 (website preview)                                                      | Referenced, not duplicated                  |

Net-new code is small and additive: one data module, one search module, one shared
component, and the eight page files under `app/intelligence/`. No existing behavior
changed except the middleware gaining one protected prefix.

---

## Security posture

BTIC is **internal-only**, and defended in depth:

- **Authentication gate.** `middleware.ts` redirects any unauthenticated request
  under `/intelligence/*` to `/login`. Reuses HL-BOS identity — **no new auth
  system**, and **never** a service-role key (publishable key + user cookies only).
- **Per-page re-check.** Every server component re-checks `getClientViewer()` and
  renders a sign-in prompt (never dossier content) if not authenticated —
  defense in depth, not middleware alone.
- **No indexing.** `app/intelligence/layout.tsx` sets
  `robots: { index: false, follow: false, nocache: true }` across the whole
  section, so it can never be indexed or previewed even if a route were somehow
  reachable.
- **No anonymous data path.** The dossier is a server-only module rendered inside
  the auth gate; there is no public API, no anonymous read, and no client-side
  data fetch.
- **Read-only.** V1 exposes **no** write controls — no button claims to capture,
  edit, resolve, or delete anything. Per the operating contract, a control that
  cannot yet do its job is worse than its absence, so none is shown.

---

## Why no database migration in V1

V1 **reads and reviews a single seeded dossier**. That needs no new table, so —
honestly — **none was created or applied**. Adding a migration now would ship
schema that nothing writes to, and adding "capture" buttons would ship controls
that do not yet control anything. Both are forbidden by the operating contract.

When BTIC needs to **capture new engagements/records from the UI** (V1.1+), an
**additive** migration will be introduced at that point, following the established
HL-BOS pattern (RLS enabled + forced, `public.` SECURITY DEFINER RPCs as the sole
access path, `identity.is_platform_admin()` gating, audit logging). It will be
**prepared for approval and applied only with explicit CEO approval** — never
automatically. This V1 PR contains **no migration**.

---

## Tests

- [`btic-data.test.ts`](../../../apps/herman-legacy-digital/src/lib/btic-data.test.ts)
  — dossier availability, the **provenance-on-every-record** invariant, the
  explicit-gap invariant, phase ordering + single in-progress phase, the
  **current-truth-vs-retained-history** rules, the four owed decisions, and
  real-reference-only artifacts.
- [`btic-search.test.ts`](../../../apps/herman-legacy-digital/src/lib/btic-search.test.ts)
  — empty query returns all, case-insensitive matching, entity restriction,
  no-invented-matches, input-length bounding.

Run: `pnpm --filter @hl-bos/herman-legacy-digital test`

---

## Scope boundary (what V1 deliberately does NOT do)

Not built in V1, by directive: merging/deploying, any production migration, DNS
changes, a public client portal, HSCS, automated evidence collection, or AI
recommendations. BTIC V1 is investigate → model → view → review — nothing more.
