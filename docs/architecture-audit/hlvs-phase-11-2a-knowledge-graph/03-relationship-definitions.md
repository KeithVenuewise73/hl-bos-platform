# 3 · Relationship Definitions

## The closed edge vocabulary (reuse-first)

Edges reuse the catalog's existing `RelationKind` (with its declared `INVERSE_RELATION`) and add a **small, closed** set for capabilities and deployments. The set is deliberately closed — free-form edges are what turn a graph into an ambiguous mess.

### Inherited from `types.ts` (already implemented)

| Edge            | Direction (from → to)  | Inverse        | Cardinality | Meaning                                |
| --------------- | ---------------------- | -------------- | ----------- | -------------------------------------- |
| `owned_by`      | asset → owner          | owns           | N:1         | ownership                              |
| `uses`          | consumer → used        | used by        | N:M         | runtime/build use                      |
| `depends_on`    | dependent → dependency | depended on by | N:M         | hard dependency (acyclic)              |
| `provides`      | provider → provided    | provided by    | 1:N         | a service/module provides a capability |
| `consumes`      | consumer → consumed    | consumed by    | N:M         | data/event consumption                 |
| `extends`       | extension → base       | extended by    | N:M         | specialization                         |
| `referenced_by` | asset → referrer       | references     | N:M         | soft reference                         |
| `replaced_by`   | old → new              | replaces       | 1:1         | supersession                           |
| `successor`     | new → old              | predecessor of | 1:1         | lineage                                |
| `deprecated`    | asset → replacement    | deprecates     | 1:1         | deprecation pointer                    |

### New capability/deployment edges (Phase XI-2A additions to the closed set)

| Edge            | Direction                         | Inverse         | Cardinality | Meaning                            | Source                                 |
| --------------- | --------------------------------- | --------------- | ----------- | ---------------------------------- | -------------------------------------- |
| `provided_by`   | capability → module               | provides        | N:M         | which modules realize a capability | Capability Library `providedByModules` |
| `composed_of`   | product → capability              | composed into   | N:M         | product ← capabilities             | compositions ⋈ capability              |
| `consolidates`  | capability → legacy key           | consolidated by | 1:N         | legacy registry keys folded in     | `duplicatesConsolidated`               |
| `alias_of`      | legacy key → capability           | has alias       | N:1         | cross-registry alias               | Capability `aliases`                   |
| `deployed_as`   | application → deployment          | deployment of   | 1:N         | a running instance                 | Application Registry                   |
| `hosted_on`     | deployment → host                 | hosts           | N:1         | Coolify/Vercel/Pages/Supabase      | Application Registry `hosting`         |
| `targets`       | product → industry                | targeted by     | N:M         | industry fit                       | compositions `industryTemplate`        |
| `built_with`    | module → technology               | used by         | N:M         | tech stack                         | pnpm catalog                           |
| `requires`      | gov program → capability          | required by     | N:M         | bid capability need                | Government Intelligence                |
| `would_provide` | acquisition target → capability   | provided by     | N:M         | acquisition adds capability        | Discovery (future)                     |
| `maps_to`       | external opportunity → capability | mapped from     | N:M         | opportunity ↔ capability           | Discovery (future)                     |

## Rules that prevent duplicate / incoherent relationships

1. **Dedupe key** = `(from, kind, to)`. The projection collapses identical triples; there is never a second edge with the same meaning.
2. **One semantic per edge kind.** `uses` ≠ `depends_on` ≠ `consumes` — they are not interchangeable. A hard build dependency is `depends_on`; a soft runtime call is `uses`; an event/data flow is `consumes`.
3. **Every edge has an inverse** (`INVERSE_RELATION` + the new inverses above), so the graph reads correctly from both ends without storing two rows.
4. **Closed set.** Adding an edge kind is a deliberate change to the vocabulary (like adding an `AssetKind`), reviewed — never invented at a call site. This is the same governance the catalog already enforces.
5. **`depends_on` and `composed_of` chains are acyclic.** Cycles are a modeling error and must fail validation (a build-order and reasoning guarantee).
6. **Edges carry provenance.** Each edge records the source that asserted it (registry field, composition, migration), so an AI or an executive can see _why_ the relationship exists.

## Edge attributes

An edge may carry: `note` (already on `Relationship`), `provenance` (source), `confidence` (for future AI-advisory edges — deterministic edges are always confidence 1.0), and `scope` (inherited from endpoints, used for read-gating cross-scope edges).
