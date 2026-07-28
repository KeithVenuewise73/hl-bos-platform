# HL-BTI Consulting Intelligence Framework — Architecture Impact Report (Deliverable 11)

## 1. Net additions

- **One new module** inside the existing canonical engine: `packages/bti-engine/src/consulting/` — `types`, `knowledge` (43-dimension knowledge base), `priority`, `findings`, `roadmap`, `solutions`, `financial`, `narrative`, `review`, `industry` (12 templates), `render`, and an `index` orchestrator (`generateConsultingReport`).
- **Exposed** from the package as `consulting` (`export * as consulting`).
- **Tests:** `consulting.test.ts` (15).
- **Generated deliverables:** the HSCS and Venuewise case-study documents (deterministic output, committed).

## 2. Net platform-service additions: ZERO

No database migration, no new schema, no new app, no change to any `bti.*` object, the edge `_shared/bti`, the Alpha app, or the control-center. The framework is pure, deterministic TypeScript that runs over an assessment's data. It reuses the scoring engine, the domain/dimension catalog, growth intelligence, and the lifecycle — see [Reuse Analysis](01-reuse-analysis.md).

## 3. Why it lives in `@hl-bos/bti-engine`

The PCO requires the framework to power **every future Herman Legacy product** (VisibilityAI, TransportationAI, SalonAI, FleetHuddle, HomeHuddle, …). Placing it in the one canonical engine — already shared by the DB authority (`bti.*`), the edge layer (`_shared/bti`), and the Alpha UI — means every current and future surface consumes the identical consulting logic. A per-product copy would violate the no-duplication rule and drift.

## 4. Determinism & honesty (architecture-level guarantees)

- Every exported function is pure: same input → same output (asserted by a determinism test that compares serialized reports).
- No function reads a clock, a random source, or the network; the case-study generator passes inputs in.
- The financial module structurally cannot emit a number without the supporting input; missing evidence returns `null` + the required-information note.
- The narrative module structurally cannot emit prose for a section it has no data for; it returns `hasData: false` with a reason.

## 5. Consumption paths (no change required to adopt)

- **Backend / edge:** an edge function can call `generateConsultingReport` over a completed `bti.assessments` row and persist or return the package — no new engine.
- **Alpha UI:** the Alpha can render `findings` / `roadmap` / `narrative` / `review` directly; the data shapes are stable TypeScript types.
- **Future products:** import `@hl-bos/bti-engine` and call the same function with their industry pack.

## 6. Standing constraints honored

`main` protected (branch + PR); TypeScript pinned 6.0.3; no secret exposed; no legacy asset touched; no migration applied; RLS/tenancy unaffected (no DB change). Reuse-first; no duplicate platform service.
