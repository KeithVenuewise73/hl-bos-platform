# 9–12 · Impacts & Phase XI-2 Recommendation

## 9 · Impact on the Enterprise Catalog

**Minimal — the catalog is already the platform-scope subgraph.** It ships `Asset` (13 node kinds), `Relationship` (10 edge kinds), `INVERSE_RELATION`, and `neighborhood()` traversal. The Knowledge Graph _is_ the catalog graph, completed.

Changes (design only):

- **Add node kinds** the catalog doesn't yet model as first-class: `business_unit`, `technology`, `ai_model`, `deployment`, `roadmap_phase`. (Some exist implicitly as `owner` strings / metrics today.)
- **Formalize the new edge kinds** (§03) alongside the existing `RelationKind` — same closed-set governance.
- **Keep the in-code registry as the authoring surface**; the graph is projected from it. No change to how assets are authored or verified.
- Completeness/reconciliation extends to node/edge coverage (a node with no source, or an edge to a missing node, fails CI).

Net: the catalog gains breadth (more node/edge kinds), not a redesign.

## 10 · Impact on the Capability Library

**The Capability Library becomes the semantic core of the graph.** Its already-computed links become first-class edges:

- `providedByModules` → `provided_by` edges.
- product/application relationships (`productsForCapability`, `applicationsForCapability`) → `composed_of` / `uses` edges.
- `dependsOn` → `depends_on` edges (must stay acyclic).
- `aliases` / `duplicatesConsolidated` → `alias_of` / `consolidates` edges.

**The duplicate gate becomes a graph query.** `duplicateCheck` / `evaluateReuse` already reason over capabilities; on the graph they additionally traverse `provided_by`/`composed_of` to weight reuse by real module availability. No behavior change is required for XI-2A — this is the target the XI-1 contract was built for.

## 11 · Impact on the Application Registry

**It becomes the Deployment/operational subgraph.** Each `ApplicationRecord` projects to:

- an `Application` node,
- `deployed_as` → `Deployment` nodes (per environment),
- `hosted_on` → `Host` nodes (GitHub Pages, Vercel, Supabase, future Coolify),
- `uses` → `Capability` nodes (via `reusableModules` → `provided_by`, already computed),
- `owned_by` → `Business Unit` nodes (from `executiveOwner`).

The Phase VIII/IX assessment stands: the registry is the authoritative _deployment projection_, linked to the catalog — the graph makes that link explicit and typed. Honest gaps (DNS/health `unknown`) remain nullable, evidence-gated edges.

## 12 · Recommendation for Phase XI-2 implementation

Implement the graph as a **read model + deterministic traversal API**, migration-gated, reusing everything above.

**Phase XI-2 (recommended scope, in order):**

1. **XI-2a — In-code graph projection** (no migration): a `@hl-bos/catalog` `graph` module that projects the catalog + Capability Library + Application Registry into a typed node/edge set, with `neighborhood()` generalized to typed edges and the acyclic/reconciliation validators. Ships the traversals in §05 as pure functions. _Zero production risk; code-review only._
2. **XI-2b — Read-model persistence** (migration-gated): the proposed `catalog`/`graph` schema (§ Phase X 09) as a materialized projection, refreshed by CI/edge worker; `public.graph_*` SECURITY-DEFINER read RPCs enforcing scope. _Requires CEO migration approval._
3. **XI-2c — Portal graph views** (read-only): "Impact analysis", "Reuse map", "Blast radius" over the traversals — reusing the portal contract and authz.
4. **XI-2d — Wire the duplicate gate into the Software Factory** as the mandatory pre-build check (the anti-duplication gate on the graph), still human-approved.

**Sequencing rationale:** XI-2a delivers the full graph and every executive question with **no production risk** (in-code, tested) — it is the right first build. Persistence (XI-2b) and Factory wiring (XI-2d) are separate, individually-gated steps.

**Guardrails carried forward:** deterministic authority / advisory AI; evidence-or-planned; closed vocabularies; scope-safe reads; write-to-source-only; no AI memory store. Every migration, deploy and Factory wiring is an individual CEO approval.

---

### One-line summary

The Enterprise Knowledge Graph is the catalog's existing typed relationship graph, **completed across every enterprise entity and governed as a read projection** — giving Herman Legacy one explainable, deterministic model that answers "how does everything relate?" and powers reuse, discovery, acquisition and executive reporting without a second architecture. **Blueprint only — no XI-2 implementation begun.**
