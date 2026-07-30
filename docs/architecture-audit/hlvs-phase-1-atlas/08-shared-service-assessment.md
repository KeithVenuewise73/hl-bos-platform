# 08 · Shared Service Assessment

The shared spine is the reason this platform exists: capability is built **once** and every product reuses it. This report rates each shared domain's maturity and reuse posture. The headline: the spine is real, tested, and broad — the gaps are runtime activation and a few deferred additions, not missing foundations.

Ratings: **Reuse unchanged** · **Reuse + extend** · **Reuse + deploy** (built, needs runtime) · **Reuse + repair** (built, one part stubbed) · **Absent**.

---

## 1. The spine, domain by domain

| #   | Domain                  | Schema                     | What it provides                                                                  | Maturity         | Posture                                      |
| --- | ----------------------- | -------------------------- | --------------------------------------------------------------------------------- | ---------------- | -------------------------------------------- |
| 1   | Identity & Auth         | `identity` + Supabase Auth | Profiles, memberships, invitations; `profiles.id = auth.users.id`                 | Live             | Reuse unchanged                              |
| 2   | Multi-tenancy           | `platform`                 | One tenant concept (first-party + customer), atomic provisioning, parent/child    | Live             | Reuse unchanged                              |
| 3   | Roles & permissions     | `identity`                 | 8 roles, 17 permissions, permission-based (never role-name) access, no-escalation | Live             | Reuse + extend (add permissions per product) |
| 4   | Audit & security events | `audit`                    | Append-only, immutable-even-to-admins log; 42+ triggers across sensitive tables   | Live             | Reuse unchanged                              |
| 5   | Event bus               | `events`                   | Transactional outbox, at-least-once delivery, handler registry                    | Live (DB)        | Reuse + deploy                               |
| 6   | Entitlements            | `entitlements`             | Feature catalog, plan mapping, module activation, `has_feature()`                 | Live             | Reuse unchanged                              |
| 7   | Integrations            | `integrations`             | Connector/connection/sync/webhook framework; 5 seeded connectors                  | Live (framework) | Reuse + extend (no live connector code)      |
| 8   | AI gateway              | `ai`                       | Metered single door, budgets, run ledger, guardrail hook                          | Live (DB)        | Reuse + deploy + grant key                   |
| 9   | Workflows / human gate  | `workflows`                | Reusable approval instances/tasks/approvals                                       | Live             | Reuse unchanged                              |
| 10  | Billing                 | `billing`                  | Subscriptions, invoices, payments, entitlement reconciliation                     | Live (DB)        | Reuse + repair (Stripe adapter stubbed)      |
| 11  | Storage                 | `storage_meta`             | File registry, retention classes, signed-URL access boundary, path-safety         | Live             | Reuse unchanged                              |
| 12  | Communications          | `comms`                    | Email/SMS templates, consent, suppression, send-with-approval                     | Live (DB)        | Reuse + deploy                               |
| 13  | Discovery / assessment  | `discovery`                | The BI engine (collectors → profile → scored assessment → blueprint)              | Live (DB)        | Reuse + deploy (workers)                     |
| 14  | Commerce & provisioning | `sales`, `provisioning`    | Proposal → agreement → provisioning request → work order → factory authorization  | Live (DB)        | Reuse + deploy                               |
| 15  | Reporting / analytics   | —                          | Cross-tenant reporting as a shared service                                        | Absent           | Defer (seed from assessments)                |

**Compared to Phase 0:** the two "single largest foundational absences" the prior audit flagged — **communications** and **storage** — are now **built** (`comms`, `storage_meta`). Discovery, commerce/provisioning, and the Factory are all new since then too. The spine has closed its most important gaps.

## 2. What makes the spine trustworthy

- **Deny-by-default, everywhere.** RLS on 100% of tables; `anon` revoked at the schema level; writes funneled through permission-checked functions.
- **One of everything.** One tenant model, one identity core, one billing engine, one AI gateway, one event bus, one config reader. A second of any of these is explicitly prohibited (see report 10).
- **Reconciliation is automatic.** Billing writes entitlements; entitlements gate features; provisioning writes both. The domains are wired, not siloed.
- **Anti-fabrication is structural.** Reviews, invoices, and payments have no tenant write path; the audit log can't be rewritten; scores are null-not-zero.

## 3. Notes and small risks worth flagging

These are not defects in the foundation — they are items to decide or tidy:

1. **Denials are raised but not durably audited in-database.** When an action is refused, the raised error rolls back the transaction, including any audit row. The documented intent is to log denials at the API layer instead. Worth confirming before customer data lands.
2. **Reference tables read as open.** Global catalogs (plans, features, service/module catalogs) use `using (true)` select policies. This is intended (they're shared reference data), but "RLS enabled" should not be read as "tenant-restricted" for these — restriction is on writes.
3. **The `bti_*` public functions are the one broad execution surface.** Five `SECURITY DEFINER` functions are callable by any signed-in user (the HL-BTI public API). They enforce membership internally, so this is safe, but it should remain a consciously reviewed surface, not grow casually.
4. **Integrations and billing are frameworks with a stub at the edge.** The registries are complete; the _live_ connector code and the Stripe adapter are the parts still to implement.
5. **`hlvs.non_exceptionable_rules`** lacks an explicit `search_path` (advisor warning) — a one-line hardening fix.

## 4. Reuse verdict

**The shared services are the crown jewel of the estate and the whole justification for HL-BOS.** Eleven of the fifteen domains are reuse-unchanged or reuse-plus-deploy; only reporting is genuinely absent (and deliberately deferred); only billing needs a repair (the Stripe adapter). Every future product — and the Enterprise Catalog itself — should be _assembled from these services_, and the strongest architectural guardrail Phase II can keep is the existing rule: **no product may introduce a second identity, tenancy, billing, entitlement, event bus, workflow, or storage system.**
