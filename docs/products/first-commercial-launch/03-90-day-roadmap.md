# First Commercial Launch · 90-day execution roadmap — HL-BTI

**For:** Keith Herman, CEO · **Date:** 2026-07-31
**Product:** HL-BTI, launched as a **consultant-operated managed transformation service**.
**This roadmap executes only after you approve it.** Nothing here has been built or deployed.

🔑 = your trust/business decision · ⚙️ = I execute after the preceding 🔑.

## Why this is weeks, not months

HL-BTI's backend (`bti` schema, 14 tables, 5 public API RPCs) is **already applied to
canonical production**, the app build has real Supabase Auth + Docker/Coolify + a domain, and
627/627 DB tests pass. The remaining work is **deploy, wire the AI key, land the first
engagement, and close three known evidence gaps** — reuse-first, no rebuild.

## Week 0 — the ignition decisions (🔑 you, once)

These are the "grant access / set terms" trust decisions only you can make. Until they exist,
nothing can go live.

- [ ] 🔑 **Grant the Anthropic API key** — unlocks live AI analysis (today the AI seam is
      keyless/mock).
- [ ] 🔑 **Authorize deploying `apps/hl-bti` to production** (`bti.hermanlegacygroup.com`)
      against canonical production.
- [ ] 🔑 **Set the engagement commercial model** — at minimum the consulting **engagement
      fee** (productized subscription can come later). _No price is invented for you; this is
      your number._
- [ ] 🔑 **Billing decision:** bill the first engagements **out-of-band** (recommended — no
      Stripe wiring needed, revenue isn't gated on it) _or_ authorize implementing the Stripe
      adapter now (currently stubbed).

## Phase 1 — Days 1–30 · Go live as a consulting delivery tool

**Goal:** a Herman Legacy consultant can run a full engagement on production and produce a
client-ready blueprint/proposal.

- [ ] ⚙️ Deploy `apps/hl-bti` to production with real Supabase Auth (backend + API already
      live).
- [ ] ⚙️ Wire and exercise the **live AI seam** end-to-end (the one seam the PRO-001 rehearsal
      could not test without a key).
- [ ] ⚙️ Re-run the **PRO-001 executive workflow on production** (not preview) to clear the
      IAT-001 "deployment-state FAIL"; capture the evidence.
- [ ] ⚙️ Provision the first consultant user + role; smoke-test authz/RLS with a real login.
- **Exit criteria:** one consultant completes a real assess → blueprint → proposal on
  production; the output is a client-ready document; deployment verified with real evidence.

## Phase 2 — Days 31–60 · First paying engagement + close the 3 evidence gaps

**Goal:** bill the first engagement and remove the Executive Validation's structural
weaknesses — reuse-first (13 reused / 3 modified / 3 new bridges; **not** a rebuild).

- [ ] 🔑 Select the first engagement from the **warm HSCS consulting pipeline**.
- [ ] ⚙️ Build the **three evidence bridges**: (a) surface the consulting work _in the app_,
      (b) generate the **client-facing deliverable**, (c) anchor scoring in **evidence
      provenance** rather than only 43 manual opinion ratings.
- [ ] ⚙️ Deliver engagement #1; capture ROI/testimonial evidence (real, not illustrative).
- [ ] 🔑 Issue the first invoice (out-of-band or via the newly wired billing).
- **Exit criteria:** first revenue recognized; the app produces the client deliverable;
  scoring shows where each number came from.

## Phase 3 — Days 61–90 · Prove repeatability, productize, open the funnel

**Goal:** 2–3 completed engagements, a decision on productized terms, and the runway to
launch #2.

- [ ] ⚙️ Deliver engagements #2–#3; refine from real feedback.
- [ ] 🔑 **Decision gate:** set productized **managed-service subscription** terms — now
      backed by real engagement economics — and decide whether to implement the Stripe adapter
      for self-serve billing.
- [ ] ⚙️ **Begin VisibilityAI launch-readiness** (launch #2, the funnel): start the
      **live-egress security hardening** (SSRF / connect-time IP pin) that is the one hard
      blocker before VisibilityAI can safely assess real customer sites and feed HL-BTI leads.
- **Exit criteria:** 2–3 engagements delivered on production; productized terms decided;
  VisibilityAI security-hardening underway.

## Success metrics (targets to set with you — not invented)

Tracked honestly (per Principle 10, never invent runs/metrics):

- Engagements completed on production (target: **3** in 90 days).
- First revenue recognized (Phase 2).
- Client deliverable produced per engagement (yes/no).
- Scoring evidence-provenance shipped (yes/no).
- Consultant feedback on the delivery tool.

_The specific revenue and engagement-count targets are yours to set; the structure above is
the honest scaffold._

## Risks & guardrails

- **Do-not-rebuild:** respect the SalonAI Gap Register and the Factory duplicate-risk check —
  every capability HL-BTI needs already exists; compose, don't recreate.
- **Disclosure:** until the three evidence bridges land, HL-BTI remains
  _consultant-operated_; do not market it as an unattended, objective self-assessment SaaS.
- **No scope creep into infrastructure:** this workstream builds a _product launch_, not more
  platform. Anything that looks like platform expansion pauses for your approval (per your
  standing instruction).
- **Everything stays gated:** keys, deploy, terms, and each invoice are your decisions; I
  execute and report with real evidence.

## What happens after 90 days (preview, not commitment)

Launch #2 **VisibilityAI** (funnel) once live-egress security is done; then **Review
Management** as its upsell; then **SalonAI** as the first full Factory vertical pilot with
Canvas Hair Co. Each is a separate approval.
