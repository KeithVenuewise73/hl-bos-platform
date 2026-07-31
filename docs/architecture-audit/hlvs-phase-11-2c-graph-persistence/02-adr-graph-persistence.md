# ADR-XI-2C · Persistent Knowledge Graph Read Model

**Status:** Accepted (implemented + locally validated on `claude/hlvs-architectural-assessment-ltqs1b`; **not applied remotely, not merged**).
**Date:** 2026-07-31 · **Context:** Phase XI-2C, migration-authorized stage of the approved Knowledge Graph roadmap.

## Decision

Persist the deterministic in-code Knowledge Graph as a **versioned, read-only DB projection** via migration `0028` (new bounded `graph` schema), fed by a controlled SECURITY DEFINER publisher and queried through read-only `public.graph_*` RPCs. The in-code `buildKnowledgeGraph()` remains the semantic contract; the DB is a runtime read projection.

## Decisions of record

| Decision                              | Rationale                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New bounded `graph` schema**        | No domain schema fits; internal, not PostgREST-exposed (config.toml exposes only `public`).                                                                                                  |
| **Read model, not a source of truth** | Only the publisher writes; ordinary/authenticated roles have **no** write policy. Rebuildable from registries.                                                                               |
| **Vocabulary as rows**                | `node_types`/`edge_kinds`/`scopes` reference tables (house pattern) + FKs enforce valid vocabulary; `edge_kinds` carries the declared inverse.                                               |
| **DB constraints enforce integrity**  | PK `(projection_id, edge_id)` dedupes; composite FKs guarantee valid endpoints; CHECK `from<>to`; NOT NULL evidence; partial unique index = one active projection.                           |
| **Cycle check stays in code**         | Cycle detection is done by the in-code validator; `publish_projection` refuses publication unless `p_integrity_ok=true` (proven in code) — DB need not re-implement graph cycles.            |
| **Atomic activation + rollback**      | `activate_projection` supersedes the prior active and marks the staged one active in one transaction (partial unique index guards); `rollback_projection` reactivates the newest superseded. |
| **Deterministic checksum**            | `serializeGraph` computes a pure FNV-1a checksum over node/edge identity+classification; drift changes it (tested).                                                                          |
| **Scope-aware reads**                 | `_can_see(scope, tenant)` gates platform/tenant/opportunity; tenant nodes require `has_permission(tenant,…)`; opportunity nodes an extra platform perm.                                      |
| **Bounded RPCs**                      | Every read RPC caps depth (≤12) and result count (≤1000), orders deterministically, returns `projectionVersion` + explanation; no arbitrary dynamic SQL.                                     |
| **No autonomous refresh**             | The publisher is a controlled mechanism; scheduling requires separate authorization.                                                                                                         |

## Alternatives rejected

- **Reuse `bti`/`discovery` schema** — semantically wrong; the graph spans all domains.
- **Store the whole graph as one JSON blob** — rejected; typed columns are required for filtering, authz, indexing and integrity (JSON only for supplemental `metadata`).
- **Expose graph writes to subsystems** — rejected; would create a competing source of truth. Writes go to source registries; the graph re-projects.
- **Apply remotely to validate** — rejected/forbidden; validated on a throwaway local Postgres cluster instead.

## Consequences

- **Positive:** a persistent, versioned, integrity-constrained read model with atomic publish/rollback and bounded scope-safe RPCs; in-code ↔ DB parity by construction; zero production impact until an approved apply.
- **Accepted:** the projection is republished wholesale per version (not incrementally diffed) — fine at this scale (145/427). Audit-trigger integration and the remaining RPCs (reuse-candidates, opportunity-overlap, traverse) are a documented follow-up.
