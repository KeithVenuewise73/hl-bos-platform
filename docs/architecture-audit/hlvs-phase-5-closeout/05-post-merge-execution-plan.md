# Post-Merge Execution Plan

The exact sequence after Project Atlas is approved and merged, to reach the first commercial Factory production run (SalonAI for Canvas Hair Co.). Each step is marked **⚙️ Claude can execute independently** or **🔑 requires your approval/access**.

> Nothing here happens during Atlas closeout. This is the plan for _after_ you approve the merge.

| #   | Step                                                                                                            | Who                              | Notes / gate                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **Merge Atlas** into `main`                                                                                     | 🔑                               | Your approval on the PR. Brings `main` up to the current platform + Atlas             |
| 2   | **Create a clean SalonAI production branch** off `main`                                                         | ⚙️                               | e.g. `feat/salonai-pilot`; Atlas stays intact                                         |
| 3   | **Apply or defer the approval-gated catalog migrations** (`0028` catalog registry, `0029` module registry seed) | 🔑                               | Your call to apply; Claude prepares/verifies. Not required for SalonAI to function    |
| 4   | **Configure required AI credentials** (Anthropic key → Vault; Stripe key)                                       | 🔑                               | Access grant only you can make; Claude wires the references                           |
| 5   | **Configure the pilot tenant** (provision Canvas Hair Co.)                                                      | ⚙️                               | Via `provision_tenant`; no manual SQL. Real data entered by the customer              |
| 6   | **Assemble SalonAI through the Factory** (compose the 13 registered modules)                                    | ⚙️                               | Reuse-only; the assembler verifies before building                                    |
| 7   | **Complete product-specific gaps** (G1 salon domain, G2 booking, G3 app surfaces, G4 site — see gap register)   | ⚙️                               | Product-specific only; no shared capability rebuilt. Each new table RLS+FORCE + pgTAP |
| 8   | **Validate the pilot** (unit/DB/integration/security per the spec)                                              | ⚙️                               | Green tests + 0 error advisories before staging                                       |
| 9   | **Deploy to staging**                                                                                           | 🔑 (authorize) / ⚙️ (execute)    | Requires the governed deploy path; you authorize the first deploy                     |
| 10  | **Obtain CEO acceptance** (staging demo + pilot acceptance criteria)                                            | 🔑                               | Your sign-off recorded, like the HL-BTI acceptance tests                              |
| 11  | **Deploy to production**                                                                                        | 🔑 (authorize) / ⚙️ (execute)    | Only after acceptance; governed path; migrations approved                             |
| 12  | **Onboard Canvas Hair Co.** (invite staff, seed services/hours)                                                 | ⚙️                               | Real customer data; honest empties until entered                                      |
| 13  | **Begin commercial validation** (real bookings/payments/reviews; watch metrics)                                 | ⚙️ (run) / 🔑 (commercial terms) | Requires pricing/licensing set (decision package)                                     |

## Approval checkpoints (the 🔑 moments)

1. **Merge Atlas** (step 1).
2. **Apply the gated migrations** (step 3).
3. **Grant AI + Stripe credentials** (step 4).
4. **Set commercial terms** (before step 13; ideally before step 1).
5. **Authorize staging & production deploys** (steps 9, 11).
6. **CEO acceptance of the pilot** (step 10).

Everything else Claude executes independently, reusing the built platform.

## What Claude will NOT do without you

Deploy to production, mutate the live database beyond an approved migration, grant or store a real secret, invent commercial terms, or rebuild any shared capability. These are the same guardrails Atlas honored.

## The single recommended next prompt (after merge)

> "Atlas is merged. Create branch `feat/salonai-pilot` from `main`. Following `docs/architecture-audit/hlvs-phase-5-closeout/03-salonai-production-run-spec.md` and the gap register (04), build SalonAI's product-specific work only (salon domain, booking/calendar, the three app surfaces, public site) — reuse every shared module, rebuild nothing. Assemble via the Factory, add RLS+FORCE + pgTAP for all new tables, keep pricing/keys/deploys gated on my approval, and stop for review before any deploy."
