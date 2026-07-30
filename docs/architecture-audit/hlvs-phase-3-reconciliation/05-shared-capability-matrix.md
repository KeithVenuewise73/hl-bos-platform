# 05 · Shared Capability Matrix

Each built shared capability and the HLVS recommendations / products it already satisfies. This is the reuse dividend made explicit: it shows why most products are cheap to finish — the capability they need is already sitting in the spine.

## Shared services → what they satisfy

| Shared capability (built)                                     | Satisfies these recommendations                                                                   | Consumed by                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Identity / Tenancy / Permissions** (`identity`, `platform`) | identity module, tenant_identity capability, registration (partial), Venuewise tenancy            | Every product                  |
| **Audit** (`audit`)                                           | analytics plumbing, compliance, "activity" logging                                                | Every product                  |
| **Events / Outbox** (`events`)                                | workflow_automation (infra), notifications backbone, event_management (infra)                     | All workers                    |
| **Entitlements** (`entitlements`)                             | edition/feature gating, module activation                                                         | All products                   |
| **AI Gateway** (`ai`)                                         | ai_receptionist (runtime), content_creation, any AI feature; metering/budgets                     | VisibilityAI, HL-BTI, commerce |
| **Workflows / Human Gate** (`workflows`)                      | approval flows, "requires_human_review" on every catalog item                                     | All products                   |
| **Billing** (`billing`)                                       | payments module, billing module, payments service, subscriptions                                  | All commercial products        |
| **Storage** (`storage_meta`)                                  | storage module, document_management (foundation), media (foundation)                              | Docs, media, Huddles           |
| **Communications** (`comms`)                                  | communications module & service, missed_call_recovery, customer_follow_up, reputation (send path) | All customer-facing products   |
| **Integrations** (`integrations`)                             | local_visibility (google_business), seo (pagespeed), review sources                               | VisibilityAI, verticals        |
| **Discovery / Assessment** (`discovery`)                      | business_discovery service, lead_capture, website assessment, blueprint, recommendation engine    | VisibilityAI, HL-BTI           |
| **Commerce & Provisioning** (`sales`, `provisioning`)         | proposal, agreements, custom_software delivery, vertical_os provisioning                          | HL-BTI, all sold products      |
| **Deterministic Scoring** (`bti-engine`, discovery scoring)   | kpi_scoring capability, dashboards, growth intelligence, maturity/health frameworks               | HL-BTI, VisibilityAI           |
| **HLVS Factory** (`hlvs`)                                     | custom_software, vertical_os, every "build a new product" recommendation                          | The Factory itself             |

## AI capabilities → what they satisfy

| AI capability (built)               | Satisfies                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Deterministic scoring engines       | KPI scoring, digital maturity, business health, growth intelligence, executive scores |
| Recommendation engine               | module/service recommendations, opportunity surfacing                                 |
| Conformance & readiness engines     | governed software creation (custom_software, vertical_os)                             |
| Duplicate-risk check                | anti-duplication across all new modules                                               |
| Prompt-injection fence + AI gateway | safe AI for any content/analysis feature                                              |

## Coverage read-out

| Recommendation family                                | Satisfied by existing shared capability?  |
| ---------------------------------------------------- | ----------------------------------------- |
| Identity / access / tenancy                          | ✅ Fully                                  |
| Communications / notifications                       | ✅ Fully                                  |
| Billing / payments / subscriptions                   | ✅ DB fully (adapter pending)             |
| Storage / documents                                  | ✅ Foundation (UI per product)            |
| Discovery / assessment / lead capture                | ✅ Fully (engine); UI per product         |
| Scoring / dashboards / KPIs                          | ✅ Engine fully; product dashboards exist |
| Sales / proposals / provisioning                     | ✅ Fully (DB)                             |
| AI governance / metering                             | ✅ Fully                                  |
| Workflow / approvals                                 | ✅ Fully                                  |
| **Reporting / analytics (cross-product)**            | ❌ Missing shared service                 |
| **Video / media AI**                                 | ❌ Missing capability                     |
| Scheduling / receptionist / route-assessment engines | ⚠️ Capability catalogued, engine to build |

**Takeaway:** of the shared capabilities every product needs, **all but two (reporting, media-AI) already exist and are reused, not rebuilt.** This is precisely the "reuse before rebuild" position the mission targets — and it is already largely achieved at the platform layer.
