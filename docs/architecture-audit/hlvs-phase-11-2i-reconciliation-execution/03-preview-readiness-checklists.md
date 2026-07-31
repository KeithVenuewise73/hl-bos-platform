# XI-2I · Preview readiness checklists (prepared; nothing executed)

**No preview is created in this phase.** These are the ready-to-run checklists for the
next phase. Migration `0028` is **now immediately ready for preview validation**: the
lineage is reconciled to production, so a preview cut from production shares one history
with the repo and `db push` reaches `0028` cleanly.

## A · Preview creation checklist

- [ ] 🔑 CEO authorizes Supabase branching (small hourly cost while the branch exists).
- [ ] ⚙️ Create preview branch `hlbos-graph-preview` from production `mvvtngiopdrgiedjmhfb`
      (`persistent=false`, `with_data=false`).
- [ ] ⚙️ Confirm the branch inherited production's history `0001–0027` at the aligned
      versions (`…181327 … 182949`) — matches the repo now.
- [ ] ⚙️ Confirm the branch carries the **platform** schemas (events/billing/hlvs/bti),
      **not** portfolio/govcon (i.e. it is a true copy of current production, unlike the
      abandoned `hlbos-m1-portfolio`).
- [ ] ⚙️ Confirm `graph` schema is **absent** on the fresh branch (0028 not yet applied).

## B · Migration validation checklist (applying 0028 to the preview)

- [ ] ⚙️ `supabase migration list` on the linked preview shows only `0028` pending.
- [ ] ⚙️ Apply `0028` to the preview (governed path / branch apply).
- [ ] ⚙️ Verify `graph` schema created; **not** PostgREST-exposed (config exposes only `public`).
- [ ] ⚙️ Verify vocab rows: `node_types` (17), `scopes` (3), `edge_kinds` (21).
- [ ] ⚙️ Verify the three permissions seeded (`graph.projection.read`,
      `graph.opportunity.read`, `graph.projection.manage`) — pass the real
      `permissions_key_format` constraint.
- [ ] ⚙️ Verify RLS enabled + forced on all six `graph` tables; **zero** non-SELECT policies.
- [ ] ⚙️ Verify read RPCs `grant execute … to authenticated`; `anon` denied.

## C · Graph validation checklist (runtime — the checks XI-2D deferred)

Seed **synthetic** identities/tenants only (never customer data): a platform owner with
`graph.projection.manage`; users with and without `graph.projection.read`; Tenant A/B.

- [ ] ⚙️ Publisher denied without `graph.projection.manage`; allowed with it.
- [ ] ⚙️ `publish_projection` refuses `integrity_ok=false`; enforces node/edge counts.
- [ ] ⚙️ Publish + `activate_projection`: exactly one active; prior superseded.
- [ ] ⚙️ In-code ↔ DB parity: 145 nodes / 427 edges; ids/types/kinds/inverse/scope/lifecycle/evidence.
- [ ] ⚙️ Every `public.graph_*` RPC gated on real `graph.projection.read`; anon denied.
- [ ] ⚙️ `graph._can_see` tenant isolation: a Tenant-A user cannot see Tenant-B nodes, and
      **cannot infer their existence** (null, not an error).
- [ ] ⚙️ Bounded traversals (`blast_radius`, `dependencies`, neighbors) respect depth/limit
      caps and deterministic ordering.
- [ ] ⚙️ Portal `/graph` card reads live preview RPCs (publishable key only; **never**
      service-role in the browser).

## D · Rollback checklist (preview)

- [ ] ⚙️ Projection rollback: publish A, publish B, activate B, `rollback_projection()` →
      A active again; exactly one active; RPCs read the restored projection.
- [ ] ⚙️ Schema rollback (if needed): the `0028` migration's `-- rollback:` block
      (drop `public.graph_*` functions → `DROP SCHEMA graph CASCADE` → delete `graph.%`
      permissions) reverses the migration cleanly.
- [ ] ⚙️ Tear down: `delete_branch` on the preview; confirm production untouched.

## Readiness confirmation

**Migration 0028 is ready for preview validation** — reconciled lineage, checksum-locked,
`-- rollback:` block present, `notYetApplied` in the registry. The only prerequisites left
are the 🔑 CEO authorizations (branching/cost, then the production apply gate later).
