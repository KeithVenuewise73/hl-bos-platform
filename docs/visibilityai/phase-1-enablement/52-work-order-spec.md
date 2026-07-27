# Phase 1 · Deliverable 9 (CP7) — Implementation Work Order Specification

**Date:** 2026-07-27 · **Checkpoint:** 7 · Internal implementation plan from the approved proposal + provisioning request.

## 1. Model

`provisioning.work_orders` (header: customer/proposal/blueprint/request, unique `work_order_number`, status) + `provisioning.work_order_tasks` (the work). Each task carries: `workstream_key` (→ configurable catalog), `phase_key` (→ CP6 roadmap phases), `sequence`, `task`, `owner_role` (`herman_legacy`/`customer`/`shared`), `depends_on`, `priority`, `status`, estimated effort, target date, **customer responsibility**, **Herman Legacy responsibility**, required credential, required content, required approval, `blocker`, and `completion_evidence` (jsonb interface for later proof-of-done).

## 2. Configurable workstream catalog

`provisioning.workstream_catalog` seeds the 19 workstreams — Customer Onboarding, Business Information, Branding, Website, Search Visibility, Communications, CRM, Scheduling, Payments, Reviews, Reputation Recovery, AI Receptionist, Analytics, Integrations, Data Migration, Training, Quality Assurance, Launch, Ongoing Support — each with a `default_sequence` and `is_active`. Workstreams are **data**, so the set is configurable without code changes.

## 3. Generation

`provisioning.generate_work_order(request)` creates the work order and its tasks from the selected line items: a **Customer Onboarding** task first, then one task per selected item mapped to the appropriate workstream by service/module (website → `website`, comms → `communications`, etc.), with dependencies ordered so later items depend on onboarding. Responsibilities are retained on both sides. Proven by `t_work_order_created`, `t_onboarding_first`, `t_workstreams_from_items`, `t_hl_responsibility_retained`, `t_customer_responsibility_retained`.

## 4. Boundaries

The work order is an internal plan; it triggers no external action. Completion evidence is an interface (empty jsonb array) for a future execution phase. Default workstreams are a **CEO decision** to confirm ([CEO Decision Report](60-checkpoint7-ceo-decision-report.md)).
