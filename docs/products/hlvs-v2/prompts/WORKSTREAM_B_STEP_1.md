# Workstream B · Step 1 — CEO Notebook (first intelligence increment)

**Copy-paste this prompt to start Workstream B. It builds the smallest production-quality intelligence capability and integrates it into the _existing_ deployed Venture Studio. No separate app.**

---

## MISSION

Add a **CEO Notebook** to `apps/venture-studio`: a durable place for your own executive notes and observations, reusing the `vstudio.notes` table that already exists (migration 0029). This is the lowest-risk, highest-immediacy B increment — real daily value, almost no new schema.

**Assemble, do not rebuild:** reuse `vstudio.notes`, HL-BOS identity/permissions, the existing app shell, `data.ts`/`writes.ts` patterns, and the honest-empty-state convention.

## STEP 0 — Reuse map (required before code)

Produce a one-page reuse map: what is reused (`vstudio.notes`, identity, permission `vstudio.opportunity.read`/`manage`, app shell) vs. net-new. Decide the scope question below and record the choice.

### Scope decision — un-scoped notes?

`vstudio.notes.opportunity_id` is currently **`NOT NULL`** (notes attach to an opportunity). Choose one:

- **Option 1 (zero migration):** Notebook = a unified, filterable view of notes **across all opportunities** + quick-capture from any opportunity. Ship this first for fastest value.
- **Option 2 (tiny additive migration `0030`):** allow **standalone** notebook entries (make `opportunity_id` nullable, or add `vstudio.notebook_entries`) for general executive thoughts not tied to an opportunity. Additive only; `-- rollback:` marker; RLS forced; permission-gated; pgTAP.

Recommend Option 1 for Step 1, with Option 2 as a fast follow if you want un-scoped notes. **If a migration is written, it is authored UNAPPLIED** — applying it is a separate CEO gate.

## BUILD

- **Logic:** keep note typing/visibility/validation in a small pure function set (reuse `vstudio.note_type` / `note_visibility` enums); no I/O in the logic layer.
- **Data/writes:** read via `.schema("vstudio").from("notes")`; write via the existing note RPC (or add one additive RPC if Option 2), gated by `vstudio._require(...)`. No direct table writes.
- **Pages (in the existing app):** a `/notebook` view (list + filter by opportunity/type/decision-relevant) and a quick-capture form; surface "decision-relevant" notes on the opportunity detail and Executive Overview.
- **Honest states:** empty notebook says so; unauthenticated → `/login`; no fabricated entries.

## VERIFY (run it, paste real output)

- `pnpm check` (format + lint + typecheck + lineage + unit) and `pnpm build` — green.
- If a migration was written: pgTAP for RLS/permission/rollback; `check-migrations` + `check-lineage`.
- Runtime: capture a note as `platform_owner`, confirm it persists and renders; confirm anon cannot.

## GOVERNANCE

- Branch `claude/hlvs-v2-b1-ceo-notebook` off `main`; one PR; **do not merge**.
- Update the reuse map + a short capability record under `docs/products/hlvs-v2/`.
- If a migration exists, it stays **UNAPPLIED**; the PR notes the pending apply gate.

## GUARDRAILS

- No separate application — everything lands inside `apps/venture-studio`.
- Additive only; no `ALTER`/`DROP` on existing objects; TypeScript stays pinned 6.0.3.
- Principle 10: never invent notes, activity, or metrics.

## DELIVERABLE (CEO report)

What was built · reuse map (reused vs net-new) · migration decision (and UNAPPLIED status if any) · verification output (real) · the PR link · **next single approval** (merge the PR; and, if Option 2, apply migration 0030; then A redeploys to surface it).

## STOP CONDITION

Stop after building, testing, opening the PR, and reporting. Do **not** merge, do **not** apply any migration, do **not** deploy. (Deployment/redeploy is Workstream A.)
