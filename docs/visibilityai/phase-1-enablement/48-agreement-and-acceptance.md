# Phase 1 · Deliverable 5 (CP7) — Agreement and Acceptance Interface Report

**Date:** 2026-07-27 · **Checkpoint:** 7 · Records + version acceptance only. **No signatures, no legal sufficiency.**

## 1. Model

`sales.agreements` holds versioned templates by `agreement_type` (`msa`, `sow`, `subscription`, `dpa`, `aup`, `service_terms`, `implementation_authorization`, `change_order`), each with `attorney_review_status` (`unreviewed`/`in_review`/`approved`), `is_placeholder`, and `is_required`. `sales.agreement_acceptances` records an acceptance: agreement type + version, the **proposal version**, signer name + role, `acceptance_method` (`click`/`esign_placeholder`/`manual`), `ip`/`device` (future use), a stored `artifact_ref`, and the accepting user.

## 2. Honesty about legal status

Seeded templates are **placeholders** clearly titled "(PLACEHOLDER — attorney review required)" with `attorney_review_status = unreviewed`. No legal language is generated beyond these labels, and **no legal sufficiency is claimed**. Every required template is flagged for attorney review, and the readiness engine blocks factory authorization while any required template is unreviewed (`agreement_unreviewed_legal`). No live e-signature provider is integrated; no real signature or legal acceptance is collected in local testing.

## 3. Acceptance guarantees

- **Version preserved.** The acceptance stamps the exact `agreement_version` + `proposal_version` (`t_acceptance_version_preserved`).
- **Tied to a signer.** `signer_name` (+ role) is recorded (`t_acceptance_signer`); the accepting DB user is stored in `accepted_by`.
- **AI cannot accept.** `accept_agreement` requires `sales.proposal.manage` — a human permission. A non-manage user is denied (`t_agreement_requires_manage`); an AI run holds no such permission, so it can never accept an agreement.
- **Audited.** Every acceptance writes through the `acceptances_audit` trigger.
- **Gates acceptance + readiness.** All required agreements must be accepted before `customer_accept` (`t_accept_requires_agreements`, `t_agreements_complete`) and before factory readiness.

## 4. Future agreement types

The `agreement_type` enum already enumerates MSA, SOW, Subscription, DPA, AUP, service-specific terms, implementation authorization, and change order, so future agreements slot in as data + an attorney-approved template — no schema change.
