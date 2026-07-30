# SalonAI Production-Run Specification

**Product:** SalonAI — the first Software-Factory-assembled product
**Pilot customer:** Canvas Hair Co. · **Date:** 2026-07-29
**Status:** Specification & readiness only. **Do not deploy during this phase.**

Every requirement below is cross-referenced against the existing engineering module registry and classified:
**REUSE** (use as-is) · **CONFIGURE** (existing module, set config/data) · **EXTEND** (add to an existing module) · **NEW** (product-specific work; no shared capability exists). **No shared platform capability is duplicated.**

---

## 1. Product composition (from Phase IV)

SalonAI assembles from **13 registered modules** (9 shared spine + 4 product), foundation **100% built** (assemblable — proven by the Factory demo). Industry template: `salon`. Edition: Professional (pending CEO).

| Layer                             | Modules                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Shared spine (REUSE)              | identity_core, tenancy, audit, events_bus, entitlements, workflows, billing_core, storage, communications |
| Product modules (REUSE/CONFIGURE) | discovery_engine, visibility_assessments, bti_platform, scoring_engine                                    |
| AI services                       | ai_gateway (REUSE)                                                                                        |

## 2. Requirement cross-reference

| Requirement                                                                   | Existing asset                                                     | Classification                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Tenant requirements** (Canvas Hair Co. as a tenant)                         | `platform.tenants`, `provision_tenant()`                           | **CONFIGURE** (provision one tenant)                          |
| **Authentication & permissions**                                              | `identity` (Supabase Auth, memberships, roles, permissions)        | **REUSE**                                                     |
| **Data requirements** (salon domain: services, chairs, clients, appointments) | none (no salon schema)                                             | **NEW** (product-specific `salon` domain tables, RLS+FORCE)   |
| **Booking & calendar**                                                        | scheduling _capability_ catalogued; **no scheduling module built** | **NEW** (product-specific booking/calendar)                   |
| **Payments**                                                                  | `billing_core` (subscriptions/invoices/payments)                   | **REUSE** + **EXTEND** (Stripe adapter, shared)               |
| **Communications** (reminders, confirmations)                                 | `communications` module (templates, consent, send-with-approval)   | **REUSE** + **CONFIGURE** (salon templates)                   |
| **Review management**                                                         | `visibility_assessments` (`visibility.reviews`)                    | **CONFIGURE**                                                 |
| **Reputation recovery**                                                       | `visibility_assessments` + comms                                   | **CONFIGURE**                                                 |
| **CRM**                                                                       | `visibility.prospects` / `bti.businesses` (client records)         | **REUSE**/**CONFIGURE** (do NOT build a new CRM)              |
| **Reporting**                                                                 | none (no reporting service)                                        | **NEW**/**DEFER** (use `bti.ceo_dashboard()` interim)         |
| **AI receptionist**                                                           | `ai_gateway` + capability; **no receptionist engine**              | **NEW** (optional for pilot — recommend defer)                |
| **Provider abstraction**                                                      | `_shared` providers (ai/billing/comms/storage)                     | **REUSE**                                                     |
| **Required integrations**                                                     | `integrations` (google_business, review sources, pagespeed)        | **CONFIGURE**                                                 |
| **Public website**                                                            | `website_creation` service (not a module)                          | **NEW**/**CONFIGURE** (marketing site; separate from the app) |
| **Customer-facing features**                                                  | app UI over reused RPCs (booking, profile, reviews)                | **NEW** (thin client, like HL-BTI app)                        |
| **Administrative features**                                                   | app UI over reused RPCs (owner dashboard, config)                  | **NEW** (thin client)                                         |
| **Staff features**                                                            | app UI over reused RPCs (calendar, clients)                        | **NEW** (thin client)                                         |
| **Environment requirements**                                                  | HL-BOS Core DB + edge runtime + app hosting                        | **CONFIGURE**/**REUSE**                                       |

**Net:** the platform layer is entirely REUSE/CONFIGURE. The only NEW work is **salon domain data, booking/calendar, the three app surfaces (customer/admin/staff), the public marketing site, and (optional) the AI receptionist** — all product-specific, none duplicating a shared capability.

## 3. Feature detail

**Customer-facing:** browse services, book/reschedule/cancel appointments, receive confirmations/reminders (comms), pay (billing), leave a review (visibility). **Admin:** manage services/staff/hours, view calendar, view growth score & recommendations (bti/discovery), manage reviews. **Staff:** personal calendar, client notes, availability.

## 4. Deployment sequence (for the future production run — not now)

1. Provision Canvas Hair Co. tenant on HL-BOS Core (`provision_tenant`).
2. Apply the `salon` industry template + entitlements (edition Professional).
3. Deploy the edge runtime (gateway, dispatcher, comms/billing workers) — CEO/ops gate.
4. Grant the Anthropic key (AI features) + Stripe key (payments) — CEO gate.
5. Assemble SalonAI via the Factory (compose modules); complete the NEW product-specific work (salon domain, booking, app surfaces, site).
6. Seed Canvas Hair Co. data (services, staff, hours) — real data, entered by the customer.
7. Deploy app to staging → validate → CEO acceptance → production.

## 5. Validation plan

- **Unit/DB:** pgTAP tests for the new `salon` domain (tenant isolation, RLS+FORCE, no anon write) — mirror the existing test pattern.
- **Engine:** booking logic tests (no double-booking, timezone correctness).
- **Integration:** end-to-end book → confirm (comms) → pay (billing) → review (visibility) on staging with mock providers, then real providers.
- **Security:** advisor scan = 0 errors; every new table RLS+FORCE + policy; SSRF/injection guards reused for any AI.

## 6. Pilot acceptance criteria (Canvas Hair Co.)

1. Canvas Hair Co. can be provisioned and its staff invited (no manual SQL).
2. A customer can book, get a confirmation, and pay — end to end.
3. A review can be captured and surfaced; no fabricated reviews possible.
4. The owner sees a real growth score/dashboard (honest empties where no data).
5. Zero cross-tenant data leakage (pgTAP isolation test per new table).
6. No invented data anywhere; empty sections explain themselves.

## 7. Production launch gates

- [ ] CEO commercial terms set (pricing/licensing/ownership).
- [ ] Runtime deployed + AI/Stripe keys granted (CEO/ops).
- [ ] Module-registry seed approved & applied (`proposed/0029`).
- [ ] All new `salon` tables RLS+FORCE + pgTAP isolation tests green.
- [ ] Staging validation complete; CEO acceptance recorded.
- [ ] Governed deploy path in place (no by-hand production changes).

## 8. Reuse discipline (the anti-rebuild rule)

**SalonAI must not introduce a second identity, tenancy, billing, entitlement, event bus, workflow, storage, comms, or CRM.** Those are REUSE. The gap register (doc 04) is the guardrail; the Factory's duplicate-risk check flags any unauthorized duplication as a non-waivable conformance failure.
