# SalonAI Gap Register

Precise register of every remaining gap between the built platform and a shippable SalonAI for Canvas Hair Co. **Its job is to stop anyone (including a future Claude) from rebuilding capabilities that already exist.** Read this before writing any SalonAI code.

**Type:** Foundational (shared, benefits all products) vs Product-specific (SalonAI only).
**Risk:** L/M/H. **Complexity:** S/M/L. **Approval:** ⚙️ engineer / 🔑 CEO.

---

## The reuse rule (read first)

The following already exist and **must be reused, never rebuilt**: identity, tenancy, roles/permissions, audit, events, entitlements, billing (DB), storage, communications, discovery, visibility/reviews, CRM (`visibility.prospects`/`bti.businesses`), AI gateway, workflows, provider abstractions. Any SalonAI gap below is satisfied by _configuring or extending_ these — not by a new copy.

## Gap register

### G1 — Salon domain data model

- **Description:** No tables for salon services, chairs/resources, clients, appointments.
- **Partially satisfied by:** `platform.tenants`, `identity` (tenant + users); `bti.businesses`/`visibility.prospects` (client records).
- **Missing work:** a new `salon` schema (services, resources, appointments) with RLS+FORCE, tenant-scoped, function-as-API.
- **Type:** Product-specific · **Risk:** M · **Complexity:** M · **Dependency:** none · **Approval:** ⚙️ (migration → 🔑 to apply).
- **Acceptance test:** pgTAP — tenant isolation, no anon write, RLS+FORCE on every table.

### G2 — Booking & calendar

- **Description:** No scheduling/booking engine.
- **Partially satisfied by:** `scheduling` capability catalogued (concept only); `events_bus` for reminders; `workflows` for approvals.
- **Missing work:** deterministic booking logic (availability, no double-booking, timezones) + calendar model. Consider a reusable `scheduling` module (Rule of Three: SalonAI is the 1st user — build product-specific now, extract later).
- **Type:** Product-specific (candidate future shared module) · **Risk:** M · **Complexity:** L · **Dependency:** G1 · **Approval:** ⚙️.
- **Acceptance test:** engine tests — no double-booking; correct timezone; cancellation frees the slot.

### G3 — Customer / Admin / Staff app surfaces

- **Description:** No SalonAI UI.
- **Partially satisfied by:** the HL-BTI app pattern (thin RLS-trusting client over permission-checked RPCs) — the reference shape to copy.
- **Missing work:** three thin app surfaces over reused RPCs. No business logic in the client.
- **Type:** Product-specific · **Risk:** L · **Complexity:** L · **Dependency:** G1, G2 · **Approval:** ⚙️.
- **Acceptance test:** end-to-end book→confirm→pay→review on staging; honest empty states.

### G4 — Public marketing website

- **Description:** No public site for the salon.
- **Partially satisfied by:** `website_creation` service (offered, not a module); static-export pattern (hl-bti).
- **Missing work:** a marketing site (separate from the app); optional booking entry point.
- **Type:** Product-specific · **Risk:** L · **Complexity:** S–M · **Dependency:** none · **Approval:** ⚙️.
- **Acceptance test:** site deploys; booking CTA reaches the app.

### G5 — Stripe adapter (payments)

- **Description:** Billing DB is live but the Stripe adapter is stubbed (501).
- **Partially satisfied by:** `billing_core` (full DB lifecycle), `billing-webhook` edge function (stub).
- **Missing work:** implement `StripeProvider.verifyAndNormalize` + deploy the webhook.
- **Type:** **Foundational** (benefits all products) · **Risk:** M · **Complexity:** M · **Dependency:** runtime deploy · **Approval:** ⚙️ + 🔑 (Stripe key).
- **Acceptance test:** test-mode payment → `billing.payments` row via webhook; no tenant write path bypass.

### G6 — AI receptionist (optional for pilot)

- **Description:** No receptionist engine.
- **Partially satisfied by:** `ai_gateway` (metered AI), `ai_receptionist` capability (concept).
- **Missing work:** net-new engine + telephony. **Recommend DEFER for the Canvas Hair Co. pilot.**
- **Type:** Product-specific · **Risk:** H · **Complexity:** L · **Dependency:** runtime, telephony · **Approval:** 🔑 (scope + spend).
- **Acceptance test:** (if built) call handled, logged as an `ai.runs` row, never fabricated.

### G7 — Reporting

- **Description:** No shared reporting service.
- **Partially satisfied by:** `bti.ceo_dashboard()`, discovery scoring, `audit`/`ai.runs` ledgers.
- **Missing work:** shared reporting service (deferred). Interim: reuse the BTI dashboard.
- **Type:** Foundational · **Risk:** L · **Complexity:** M · **Dependency:** none · **Approval:** ⚙️ · **Defer OK.**
- **Acceptance test:** owner sees real metrics; empties explained.

### G8 — Runtime deployment (ignition)

- **Description:** Nothing is deployed; no AI key.
- **Partially satisfied by:** all edge functions built + tested (inert).
- **Missing work:** deploy gateway/dispatcher/workers, install scheduler, grant keys, governed deploy path.
- **Type:** **Foundational** · **Risk:** M · **Complexity:** M · **Dependency:** none · **Approval:** 🔑 (keys + deploy authorization).
- **Acceptance test:** a real scan/AI call shows a real cost in `ai.runs`; comms/billing workers process a delivery.

## Summary

| Gap                 | Type                 | Risk | Complexity | Approval |
| ------------------- | -------------------- | ---- | ---------- | -------- |
| G1 Salon domain     | Product              | M    | M          | ⚙️/🔑    |
| G2 Booking/calendar | Product              | M    | L          | ⚙️       |
| G3 App surfaces     | Product              | L    | L          | ⚙️       |
| G4 Public site      | Product              | L    | S–M        | ⚙️       |
| G5 Stripe adapter   | Foundational         | M    | M          | ⚙️/🔑    |
| G6 AI receptionist  | Product (defer)      | H    | L          | 🔑       |
| G7 Reporting        | Foundational (defer) | L    | M          | ⚙️       |
| G8 Runtime deploy   | Foundational         | M    | M          | 🔑       |

**Reading:** only **G1–G4** are true SalonAI build work, and they are UI + one domain + booking — everything else is reuse/ignition/deferral. The foundation is done; SalonAI is a composition exercise, not a platform build.
