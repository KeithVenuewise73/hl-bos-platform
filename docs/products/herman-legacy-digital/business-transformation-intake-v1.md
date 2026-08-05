# Business Transformation Digital Intake — V1

The public front door that begins the Herman Legacy Digital Business
Transformation process. A prospective client tells us about their business; we
capture it as a structured, secure record and begin an internal investigation.

## Purpose

Let a real prospective client, on desktop or mobile:

1. Understand the purpose of the assessment.
2. Complete a clear multi-section intake in ~10–15 minutes.
3. Submit successfully, with values preserved across validation errors.
4. Have the information stored securely.
5. Receive an honest confirmation and next-step expectation.
6. Create an internal record HLD uses to begin its investigation.

It is an Operations feature — not a CRM, dashboard, or Intelligence Center.

## Public route

- **Page:** `/business-transformation-intake` (public, unauthenticated).
- **API:** `POST /api/business-transformation-intake`.
- **Primary CTA** — "Start Your Business Transformation" — appears in the site
  header and on the home hero, both linking to the page.

## Fields collected

The ten sections are defined once, as data, in
`apps/herman-legacy-digital/src/lib/btdi.ts` (`BTDI_SECTIONS`). The form,
server validation, and stored shape all derive from that catalog.

1. **Company Information** — business name\*, website, primary contact\*,
   contact title\*, email\*, phone\*, location\*, industry\*, employees\*, year
   established\*, business stage\*, description\*.
2. **Mission and Vision** — why created, problem solved, differentiator,
   long-term goals.
3. **Products, Customers and Market** — products/services, ideal customer,
   markets served/wanted, revenue model (optional framing), competitors.
4. **Challenges and Chaos** — three biggest challenges\*, frustration, time
   lost, repetitive tasks, highest-impact problem, stress areas, hours to
   reclaim.
5. **Marketing and Visibility** — discovery channels, activities, paid ads,
   active social, visibility barriers.
6. **Digital Presence** — website, Google Business, Facebook, Instagram,
   LinkedIn, TikTok, YouTube, other (all optional — "do not require platforms
   that do not apply").
7. **Customer Journey and Operations** — lead→customer, onboarding, team time
   sink, communication, complaints, software used, bottlenecks.
8. **Goals** — 90-day\*, 12-month, success definition, growth priority.
9. **Work-Life Transformation** — ideal day, freedom meaning, prevented
   activities, one-year success. **All optional**, with an on-page explanation
   of why we ask. No sensitive personal disclosure is required.
10. **Readiness and Constraints** — commitment, budget/operational constraints,
    timing, comments, and consents.

\* = required. **Deliberate, documented deviations from "Section 1 all
required":** _Website_ is optional (our target clients often have weak or no web
presence — requiring a URL would exclude exactly the businesses we serve), and
every Section 6 digital profile is optional.

**Consent** is explicit and never pre-checked. Privacy acknowledgment and
consent-to-be-contacted are required; consent to review public business
information is offered and recorded. Consent timestamps are stored.

We **never** collect SSNs, banking credentials, passwords, tax IDs, PHI, or
identity documents.

## Storage location

**Not yet applied — pending CEO migration approval.** Migration
`supabase/migrations/20260804120000_hlbos_0031_transformation_intake.sql`:

- New **private** schema `intake` (deliberately **not** in the PostgREST
  allow-list in `supabase/config.toml`; unreachable over HTTP).
- Table `intake.transformation_submissions`: denormalized handoff facts as
  **columns** (business, contact, stage, main challenge, 90-day goal, growth
  priority) plus the full detail as **grouped JSONB** — one object per intake
  section. Not one unsearchable blob.
- Provenance: `source_page`, `attribution`, `consent_*` + `consent_at`,
  `created_at`/`updated_at`, `spam_signals`, `internal_notes`, `status`.
- Initial status: **`new`** — the internal next step "Business Transformation
  Investigation Pending".

## Security model

- **RLS enabled + forced, zero policies, no table grants** to `anon` /
  `authenticated` — the table fails closed. Nobody reads or writes it directly.
- The **only** anonymous write path is `public.submit_business_transformation_
intake(jsonb)` — a `SECURITY DEFINER` function that validates and inserts.
  `anon` holds `EXECUTE` on that function and nothing else: no table access, no
  `SELECT`, no direct `INSERT`.
- Internal reads/updates go through `public.list_transformation_intake()` and
  `public.set_transformation_intake_status()`, gated by
  `identity.is_platform_admin()`; `anon` is stripped from both.
- **No service-role key** anywhere. The app talks to Supabase with the
  publishable (anon) key only, server-side.
- Defence in depth: server-side validation, email normalization, URL
  validation, per-field length caps (app) + a 200 KB payload cap and a
  60-second same-email duplicate guard (DB), a hidden **honeypot** field, and a
  best-effort per-IP route rate limit (5 / 60s).

Until the migration is applied, `btdi-persist.ts` honestly reports
`persisted: false` (the request is captured to the server log for human
follow-up) — it never fabricates a stored record.

## How HLD processes a new submission

1. A submission lands with status `new` ("Business Transformation Investigation
   Pending").
2. A platform admin calls `list_transformation_intake()` (the queue) and sees,
   per row: business name, primary contact, business stage, main challenge,
   90-day objective, and the submission id/created time.
3. The admin opens the record, begins the investigation, and advances status
   via `set_transformation_intake_status()` (`reviewing` → `contacted` →
   `accepted`/`declined`/`archived`), optionally appending an internal note.

The client receives clarity (a simple confirmation); HLD absorbs the complexity.

## Test submission — how to remove it safely

To create one clearly-labeled test submission after the migration is applied,
call the RPC with `businessName: "TEST — Herman Legacy QA"`. Remove it safely,
scoped to that label, as a platform admin:

```sql
-- Preview first:
select id, business_name, created_at
  from intake.transformation_submissions
 where business_name like 'TEST — %';
-- Then delete exactly those:
delete from intake.transformation_submissions
 where business_name like 'TEST — %';
```

(No live customer rows exist yet; the guard on the label keeps deletion
scoped.)

## Testing performed

- **Unit** (`btdi.test.ts`, 13 cases): required-field, invalid email, invalid
  URL, over-length, missing consent, honeypot, checkbox arrays, optional
  work-life, handoff summary, stable reference, "requested not completed".
- **Database** (`supabase/tests/31_transformation_intake.sql`, 14 pgTAP
  assertions, run against real PostgreSQL 17.6): RLS enabled+forced, zero
  policies, no anon/authenticated grants, anon cannot SELECT or INSERT directly,
  anon can submit via the RPC, RPC rejects missing/invalid/consentless/duplicate
  input, anon and non-admin cannot read the queue, platform admin can.
- **Live app**: desktop + responsive form, valid submission (honest
  confirmation + reference, `persisted: false`), 422 on missing/invalid,
  honeypot rejection, 429 rate limit, honest server-side capture log.

## Known V1 limitations

- Storage is pending CEO migration approval; until then submissions are
  captured to the server log, not a database.
- No file upload (materials are requested as links only, and only if existing
  secure infrastructure supports it — V1 does not).
- No autosave to a backend (values persist across steps in the browser only).
- The internal queue is read via RPC; there is no admin UI in this increment.
- Email/notification delivery of the handoff is not wired (the record is the
  handoff; no full sensitive body is emailed).

## Future increments (explicitly deferred)

Automated website scan · SEO analysis · AI recommendation generation · Chaos
Index · client portal for intake · CRM integration · Intelligence Center
pattern analysis. **None** of these are started here.
