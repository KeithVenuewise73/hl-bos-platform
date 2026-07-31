# 7–8 · Traversal Examples & Executive Questions

All traversals are deterministic, bounded, and reuse the existing `neighborhood()` primitive (`graph.ts`) generalized to typed edges. Notation: `Node -[edge]-> Node`.

## 7 · Relationship traversal examples

### A. Impact of deprecating a module (blast radius)

```
Module(mod.scoring_engine)
  <-[provided_by]- Capability(deterministic_scoring)
     <-[composed_of]- Product(hl_bti, salon_ai, …)
     <-[uses]------- Application(hl-bti, hl-bti-alpha, executive-portal)
```

→ Everything reachable _backwards_ along `provided_by`/`composed_of`/`uses` is the blast radius. Deterministic, no guessing.

### B. Cheapest product to ship (reuse %)

```
Product(P) -[composed_of]-> Capability{c1..cn}
  each Capability -[provided_by]-> Module{built? yes/no}
  reuse% = built_capabilities / required_capabilities   (from the Factory assembler)
```

→ Rank candidate products by reuse %; the highest is cheapest to ship.

### C. Single points of failure

```
for each Capability C:
  providers = C -[provided_by]-> Module{maturity in (live, built_undeployed)}
  dependents = C <-[composed_of|uses]- {Product, Application}
  SPOF if providers == 1 AND dependents >= threshold
```

### D. Can we bid this government program?

```
GovernmentProgram(G) -[requires]-> Capability{r1..rk}
  gap = { r in requires : r has no built provider }
  verdict: pursue (gap empty) | pursue_with_partner (small gap) | decline
```

→ This is exactly the Government Intelligence capability-gap check, expressed as a graph query.

### E. Acquisition overlap analysis

```
AcquisitionTarget(T) -[would_provide]-> Capability{a1..am}
  for each a: duplicateCheck(a) over the Capability Library
  net_new = a where verdict == BUILD_NEW ; duplicate = a where REUSE/CONSOLIDATE
```

→ Shows what an acquisition genuinely adds vs. what we already own.

### F. Reusable-but-unused (retire or sell)

```
Capability(C) where maturity in (implemented, partial)
  AND C <-[composed_of]- Product == none
  AND C <-[uses]------- Application == none
```

## 8 · Executive questions the graph answers

| #   | Executive question                                            | Traversal                                                                       | Answer type                            |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | If we retire module X, what breaks?                           | A (reverse blast radius)                                                        | list of products/apps                  |
| 2   | What's the cheapest next product to ship?                     | B (reuse %)                                                                     | ranked products                        |
| 3   | Where are our single points of failure?                       | C                                                                               | capabilities + dependents              |
| 4   | Which government programs can we win now?                     | D                                                                               | pursue / partner / decline per program |
| 5   | If we acquire Z, what's new vs duplicate?                     | E                                                                               | net-new vs duplicate capabilities      |
| 6   | What do we own that's reusable but unused?                    | F                                                                               | capability list (build/sell/retire)    |
| 7   | Which business unit owns the most at-risk assets?             | `BU -[owns]-> {Application,Product}` filtered by health                         | BU ranking                             |
| 8   | Which capabilities does each customer engagement rely on?     | `Customer -[engaged_for]-> Product -[composed_of]-> Capability` (tenant-scoped) | capability list per customer           |
| 9   | What's deployed, where, and on what?                          | `Application -[deployed_as]-> Deployment -[hosted_on]-> Host`                   | deployment map                         |
| 10  | Which technologies are we most exposed to?                    | `Technology <-[built_with]- Module` in-degree                                   | tech dependency ranking                |
| 11  | What's on the roadmap and which capabilities does it advance? | `RoadmapPhase -[sequences]-> Capability`                                        | phase → capability plan                |
| 12  | If we build capability C, what does it unlock?                | forward: `C <-[composed_of]- Product` that become assemblable                   | newly-shippable products               |

Every answer is **explainable** — the path itself is the justification, and each edge cites its evidence. This is what lets an advisory AI _reason_ over the estate without becoming the authority.

## Traversal guarantees

- **Bounded** — traversals declare max depth; the graph is finite and acyclic on `depends_on`/`composed_of`.
- **Scope-safe** — a path halts at any node the caller may not read (no existence leak).
- **Deterministic** — identical graph + query → identical result, always.
