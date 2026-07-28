# IAT-001 — Independent Acceptance Test (HL-BTI)

**Testing posture:** outside QA firm engaged by Herman Legacy Group. No prior assumptions credited; only what can be independently inspected and executed the way the CEO would. **No code changed, no defects fixed, no documentation improved** — this is a findings report only.

**Question under test:** can the CEO actually use the Herman Legacy Business Transformation Platform today?

---

## Headline finding

**The product is NOT acceptable for CEO delivery today — because it is not deployed.** There is no application for the CEO to open. This is a **deployment-state** failure, not a software-quality failure: the same software passed a controlled functional rehearsal (PRO-001, 11/12), but a functional rehearsal on a private harness is not a product the CEO can open in a browser.

An acceptance test asks "can the intended user use it?" The honest answer, verified independently below, is **no — there is nothing running to use.**

---

## Step 1 — "Open the deployed application"

**Expected:** `https://bti.hermanlegacygroup.com` loads the Herman Legacy sign-in page.

**Actual (independently verified just now):**

- DNS: `bti.hermanlegacygroup.com` **does not resolve** (`getent hosts` → no record).
- HTTP: `https://bti.hermanlegacygroup.com/` → **HTTP 000 / no response**. `https://hermanlegacygroup.com/` → no response.
- Backing database (production Supabase `mvvtngiopdrgiedjmhfb`, read-only inspection via the management API): migrations applied = **0001–0017 only**. Migrations **0018–0027 are NOT applied.**
- The `bti` schema and the `public` API tables the app calls: **do not exist** (`list_tables(bti, public)` → `[]`).

**Result: FAIL.** There is no deployed application, no DNS, and the production database does not contain the application's schema or API. The CEO cannot open anything.

---

## Steps 2–12 — login → create business → intake → analyze → findings → recommendations → blueprint → proposal → logout → login → retrieve

**Result for every step: BLOCKED — cannot be executed.** Each depends on Step 1 (a running application and a logged-in account). With no deployed app, no CEO account (`auth.users` has no such user), no provisioned tenant, and no `bti` schema, none of these steps is reachable by the CEO.

| #   | Step                    | Expected                              | Actual                                           | Result      | Screenshot          |
| --- | ----------------------- | ------------------------------------- | ------------------------------------------------ | ----------- | ------------------- |
| 1   | Open deployed app       | Sign-in page at the Herman Legacy URL | DNS unresolved; HTTP 000; prod DB missing schema | **FAIL**    | n/a — nothing loads |
| 2   | Login as a normal user  | Enter credentials → workspace         | No app; no account exists                        | **BLOCKED** | —                   |
| 3   | Create a business       | Business form saves                   | Unreachable                                      | **BLOCKED** | —                   |
| 4   | Complete intake         | Fields persist                        | Unreachable                                      | **BLOCKED** | —                   |
| 5   | Run analysis            | Findings produced                     | Unreachable                                      | **BLOCKED** | —                   |
| 6   | Review findings         | Evidence-backed findings              | Unreachable                                      | **BLOCKED** | —                   |
| 7   | Review recommendations  | HL services mapped                    | Unreachable                                      | **BLOCKED** | —                   |
| 8   | Generate Blueprint      | Executive blueprint                   | Unreachable                                      | **BLOCKED** | —                   |
| 9   | Generate Proposal       | Proposal lines                        | Unreachable                                      | **BLOCKED** | —                   |
| 10  | Logout                  | Return to sign-in                     | Unreachable                                      | **BLOCKED** | —                   |
| 11  | Login again             | Session restored                      | Unreachable                                      | **BLOCKED** | —                   |
| 12  | Retrieve saved business | Prior work reloads                    | Unreachable                                      | **BLOCKED** | —                   |

**Note on capability vs. deployment:** the software _has_ been observed to perform steps 2–12 in a controlled rehearsal against a private local stack (see `PRO-001`, screenshots in `./rehearsal-screenshots/`). That demonstrates the code works; it does **not** satisfy this acceptance test, because the CEO cannot open that private harness — it is a development environment, not a deployed product. Per this order, internal harnesses are not the process the CEO follows.

**One thing the CEO _can_ open today:** a self-contained browser preview of the core analysis→blueprint→proposal workflow (published earlier as a Claude Artifact). It runs the real engine with **no login and no saving** — useful for a value demo, but it is explicitly _not_ the deployed, authenticated, persistent platform this test targets.

---

## CEO review — "Could I sit down with a customer tomorrow and successfully demonstrate this product?"

**For the deployed platform (login, save, multiple businesses): NO.** It is not deployed.

**For a value demonstration of the core workflow: YES, narrowly** — the CEO could open the no-login preview link in any browser and walk a customer through entering a business → analysis → findings → Herman Legacy recommendations → blueprint → proposal. That is a legitimate sales demo of the product's value.

Because the question is about demonstrating the **product** as accepted/delivered, the honest headline answer is **NO**, for these reasons:

1. **Nothing is deployed** — no URL resolves; the CEO has no application to open.
2. **No account exists** — the CEO cannot log in; `auth.users` has no Herman Legacy user, and no tenant is provisioned.
3. **The database isn't ready** — production has 0001–0017; the entire HL-BTI data layer (0018–0027, the `bti` schema, the `public.bti_*` API) is unapplied.
4. **No hosting** — no Coolify application, no container, no TLS.
5. **Persistence cannot be shown** — "create a business today, show the customer the saved blueprint next week" is impossible until the above exist.

None of these is a code defect; all are **deployment steps that have not been executed** (they require CEO-controlled access — Supabase, GitHub, Coolify, DNS — per the `PRO-001` runbook).

---

## Customer review — pretending to be a paying customer

Assessed from the actual rendered output (observed in the rehearsal screenshots — the real UI a customer would see):

- **Do I understand what the software does?** **Yes.** It reads a business's public signals and produces a plain-language profile, specific findings, an executive blueprint, and a proposal. The structure is clear and reads like a consulting deliverable, not a technical report.
- **Do I understand why it matters?** **Mostly yes.** Each finding states a Business Impact and a Strategic Risk, and the blueprint frames transformation priorities. It connects observations to consequences.
- **Do I understand why Herman Legacy recommends these services?** **Yes.** Every finding names the specific Herman Legacy solution that addresses it, and the proposal lists services tied back to the findings — the "why this service" traceability is explicit.
- **Would I buy?** **Plausibly, as a lead-generating consulting artifact** — the output is professional, evidence-linked, and honest (pricing is deliberately left to the CEO; the analysis is openly bounded to what a website reveals). The main customer-side caveat is that confidence/ROI are qualitative and the analysis is website-driven, so it opens a conversation rather than closing a sale on its own.

**Customer verdict:** the product communicates its value well; a customer would understand it and could be persuaded — _if it existed as something the CEO could show them beyond the no-login preview._

---

## Final acceptance — "Would you sign this software into production today?"

**NO.**

**Justification (independent QA standard):** you cannot accept into production a product that is not in production and that the intended user cannot open. Verified facts:

- No deployed application; the CEO's URL does not resolve.
- The production database is missing the application entirely (0018–0027 unapplied; `bti`/`public` API absent).
- No user account, no tenant, no hosting, no DNS.
- The real production stack (hosted PostgREST + GoTrue + PG 17 + Docker/Coolify) has **never** run this software once; the only end-to-end evidence is a private emulated rehearsal.

**What acceptance is NOT blocked by:** software quality. The code is well-built and has passed 627/627 database tests and a full functional rehearsal with zero product defects. The gap is entirely **deployment execution and one real-stack verification**, both of which require CEO-held access and are documented step-by-step in `PRO-001`.

**Condition to flip to YES:** execute the `PRO-001` runbook — arm the governed path, apply 0018–0027 (preview branch first, then production), provision the CEO account + tenant, deploy to Coolify, point DNS — and re-run this exact 12-step test **live** at `bti.hermanlegacygroup.com`. When steps 1–12 pass in the real browser against the real stack, the product is acceptable. Until then, it is not.

---

_This report is the sole output of IAT-001. No code, migration, feature, or existing document was modified in producing it._
