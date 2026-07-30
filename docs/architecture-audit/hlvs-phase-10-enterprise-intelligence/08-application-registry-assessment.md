# 8 · Application Registry Assessment

## The question

Should the Phase IX **Application Registry** become _the_ authoritative Enterprise Catalog?

## Assessment

**No — but it should become the authoritative _deployment/operational projection_ within the Enterprise Catalog.** They are two different jobs, and collapsing them would lose fidelity:

|            | Enterprise Catalog                                                          | Application Registry                                                     |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Answers    | "What software concepts exist and how do they relate?"                      | "What is deployed, where, on which branch, how healthy?"                 |
| Grain      | Semantic assets (products, modules, services, capabilities, APIs, schemas…) | Running/hostable applications                                            |
| Volatility | Slow (architecture)                                                         | Fast (branches, URLs, health, deploys)                                   |
| Fields     | relationships, maturity, reuse, ownership                                   | repository, branch, environment, URLs, Supabase project, version, health |

The Application Registry is a **specialized, higher-cardinality operational view** of one asset kind (`application`) plus external web properties. It is _already_ the right shape; it should be **linked to**, not merged into, the semantic catalog.

## Recommendation: keep it, formalize the link (minimal change)

1. **Keep the Application Registry as-is** (`packages/catalog/src/app-registry.ts`) — it's well-structured, honest (no invented URLs), and CI-governed (the reconciliation test proves no app escapes it). _Avoid unnecessary redesign — this is a keeper._
2. **Make every registry record reference a catalog asset** by key (`executive-portal` ↔ `app.executive-portal`), so the deployment view and the semantic view are one graph, not two lists.
3. **Extend the registry's reconciliation to cover external properties**, not just `apps/*` — the 10 web properties discovered in Phase IX should be governed the same way (a `web_property` reconciliation against a curated source list).
4. **Add the operational fields the directive implies** but that are currently `unknown`: DNS, TLS, last-deploy, monitoring health — as **nullable, evidence-gated** fields that fill in only when the CEO connects the relevant integration. Never fabricate them.

## Structural improvements (small, targeted)

| Improvement                                           | Why                                       | Cost                        |
| ----------------------------------------------------- | ----------------------------------------- | --------------------------- |
| Registry record → catalog asset foreign key           | one graph, no drift                       | low                         |
| `web_property` reconciliation                         | govern the 10 sites                       | low                         |
| DNS/TLS/last-deploy fields (nullable)                 | complete the operational picture honestly | low                         |
| Health = live probe (when hosting connected)          | replace `unknown` with real green/red     | medium (needs integration)  |
| Persist to the proposed `catalog` schema (read model) | runtime queryability                      | medium (§9, approval-gated) |

## Verdict

The Application Registry **graduates to the authoritative deployment projection of the Enterprise Catalog** — the single place that answers "what is deployed and where" — while the Enterprise Catalog remains the authoritative _semantic_ source of truth. One catalog, two lenses, one graph. **No redesign; formalize the link and fill the honest gaps.**
