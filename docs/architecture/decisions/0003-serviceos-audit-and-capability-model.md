# ADR-0003 · ServiceOS: one prospect store, one tenant model, one website scanner

**Status:** Accepted · **Date:** 2026-09-09
**Applies to:** migrations 0048 (`barberos`) and 0049 (`transform_audit`)
**Builds on:** [ADR-0001](0001-canonical-hl-bos-supabase-project.md), [ADR-0002](0002-migration-lineage-governance.md)

## Context

The Shop Transformation Analysis Tool + BarberOS specification proposed three new
stores: `audit_shops` (shop identity for the audit tool), `barberos_tenants`
("one row per shop"), and a fresh set of website checks for the audit's website
dimension.

All three already exist in this platform under different names.

| Spec proposal      | What already exists                                                                                                                                                                     | Migration   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `audit_shops`      | `visibility.prospects` — "a business the agency tenant is selling to", with `business_name`, `phone`, `city`, `website_url`, `industry`, a `stage` lifecycle, and `converted_tenant_id` | 0017        |
| `barberos_tenants` | `platform.tenants`                                                                                                                                                                      | 0002        |
| Website checks     | `_shared/discovery` — SSRF-validated fetch, per-redirect-hop validation, deterministic HTML extraction, rubric scoring                                                                  | 0020 / 0022 |

The spec also described the audit data as "tenant-agnostic".

## Decision

**1. The audited shop is a `visibility.prospects` row.** `transform_audit.shop_profiles`
is a satellite keyed by `prospect_id`, carrying only the local-business facts
prospects lacks: street address, postal code, Google place id, social URLs, the
hosting platform, and the source file and row it was imported from.

`converted_tenant_id` on `visibility.prospects` is already the Tool → BarberOS
handoff the spec describes as Phase 5. A second prospect table would have meant
a second lifecycle to keep in step with it.

**2. A shop is a `platform.tenants` row.** `barberos.shops` is a satellite, with
`origin_prospect_id` pointing back at the audit that won the account. The
current-state audit records what this platform's existing _two_ incompatible
tenancy models cost; a third is not available.

**3. The audit data is scoped to the agency tenant, not tenant-agnostic.**
Non-negotiable #1 requires every tenant-owned record to carry an enforceable
`tenant_id`. The spec's instinct was right — this data is not the _shop's_ — but
the conclusion was wrong: it is Herman Legacy Digital's own sales data, so it
belongs to the HLD tenant exactly as `visibility.prospects` already does. This
also means VisibilityAI can run audits for a second agency later without a
rewrite.

**4. The website dimension reuses `_shared/discovery` unchanged.**
`_shared/transform_audit/barber_web.ts` adds only the barber-specific _reading_
of the same extracted facts. The generic rubric scores digital maturity; a shop
owner does not have a digital-maturity problem, they have a "nobody can book me
at 9pm" problem. That translation is the new part. Fetching, SSRF validation and
extraction are not rebuilt.

**5. 0048 (`barberos`) is ordered before 0049 (`transform_audit`)**, inverting the
spec's phase numbers. `transform_audit.recommendations.capability_key` is a
foreign key into `barberos.capabilities`, so the catalog must exist before the
thing that points at it. Without the key, a report could recommend a module
nobody ever built.

## The honesty rules, as constraints rather than prose

The spec states that every claim must trace to something actually fetched. A
document cannot enforce that. These do:

| Rule                                                                          | Mechanism                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No dimension reaches `verified` confidence without a directly verified source | Trigger on `dimension_scores`: requires a finding on that run/dimension with a non-null `evidence_url`                                                            |
| An unreachable dimension is a gap, never a guess                              | `CHECK ((confidence = 'unknown') = (score is null))`                                                                                                              |
| The composite is computed, never asserted                                     | Trigger rejects any write to `composite_score` / `dimensions_scored` outside `recompute_composite()`                                                              |
| A report states its own coverage                                              | `dimensions_scored` / `dimensions_possible` on the run; `report()` also names the unscored dimensions                                                             |
| Findings cannot be rewritten after a report is sent                           | `findings` is append-only (trigger denies UPDATE/DELETE)                                                                                                          |
| Evidence and judgment stay separate                                           | `findings` and `recommendations` are different tables                                                                                                             |
| The outreach hook cites a real observation                                    | FK to `findings` + a trigger requiring it belong to _this_ run                                                                                                    |
| A report cannot recommend a module that does not exist                        | FK to `barberos.capabilities`                                                                                                                                     |
| Payments stays out of v1                                                      | Seeded `status = 'deferred'`; `enable_capability` refuses anything not `available`                                                                                |
| The review engine cannot be gated by predicted sentiment                      | `locked_config_keys` on the capability; trigger refuses `min_rating`, `gate_by_sentiment`, `suppress_below`, `ask_only_if_happy`, `predicted_sentiment_threshold` |

The same discipline runs one level down in the rubric: a check with nothing to
judge is dropped from the denominator rather than scored zero, so a shop is
never marked down for something we failed to look at.

## The spec's open questions

Four of the five are answered by building both options rather than by choosing
for the CEO:

1. **GBP depth.** The `google_business` dimension is modelled and weightable but
   has no collector. A campaign that weights it today closes
   `partially_completed` and the report names it as unscored. Nothing pretends
   otherwise.
2. **Audit cadence.** Re-auditing creates a new run; `runs` keeps history and
   snapshots its weights, so improvement over time is measurable whenever the
   CEO wants it. One-time and recurring both work.
3. **Report format.** `transform_audit.report(run_id)` returns the report as
   structured JSON. A PDF or one-pager is a renderer over that, not a schema
   change.
4. **Pricing / tiering.** `barberos.bundles` is a named capability set carrying
   **no price**, and `tenant_capabilities.enabled_via` records which route a
   tenant took. Tiers and à-la-carte both work; the commercial decision stays a
   commercial decision.
5. **Payments out of v1.** Confirmed, and enforced (above).

## Consequences

- The Enterprise Catalog now discovers both schemas, registered `built_undeployed`
  rather than `live`, because neither has been applied anywhere.
- `db()` in `packages/catalog/src/registry.ts` gained optional `maturity` and
  `evidence` arguments. It previously hardcoded `live` and a 2026-07-29 census as
  evidence for every schema, which is how the `intake` schema (migration 0031,
  never applied) came to be listed as live. Corrected in the same commit.
- `.hlbos/canonical.json` `notYetAppliedOrdinals` was `[]`. Checked against the
  canonical project's own applied-migration list — which runs `hlbos_0001`–`0029`
  and `hlbos_0032`–`0047` — it is now `[30, 31, 48, 49]`.
- SalonOS reuses `barberos.capabilities` with a different default-on bundle
  rather than forking the vertical.

## Status of the work itself

Both migrations are **written and tested and applied nowhere** — not to
production, not to a branch. `transform_audit` holds **zero shops**: the WNY
50-shop prospect list is not in this repository, `import_shop` is the only way
data enters, and nothing about those shops has been invented. No BarberOS
capability module exists; all nine are catalogued `planned` or `deferred` and the
toggle refuses to enable any of them.

---

## Addendum — 2026-09-09: applied, and what applying it found

0048, 0049 and 0050 were applied to canonical production (`mvvtngiopdrgiedjmhfb`)
under CEO approval. Security advisors went 36 → 36 — zero net-new findings — and
none of the 24 new `SECURITY DEFINER` functions appears in the
`authenticated_security_definer_function_executable` lint, because neither schema
is in the PostgREST allow-list.

Production schema and seed data were verified identical to the repo-applied local
build by a normalized fingerprint over 236 objects (columns, constraints,
policies, triggers, functions, and every seeded row): md5
`7afa20c040bbdf2724145c94d2153fec` on both.

Two defects were found in the process.

### 1. Transcription drift (found, corrected)

Applying the migration meant transcribing the file into an API call, and one word
of a seeded description changed — "Direct output" for "Direct answer". Caught by
the fingerprint comparison, not by re-reading. The lesson is procedural: an apply
path that transcribes is a path that can drift, and ADR-0002's checksum lock does
not extend across the API boundary. A scripted apply that reads the file bytes is
the fix.

### 2. Guard semantics depended on the environment (found, repaired by 0050)

The five format guards were written the way every HL-BOS migration writes them:

```sql
key extensions.citext ... check (key ~ '^[a-z][a-z0-9_]{2,63}$')
```

`~` is resolved from the `search_path` in force when the constraint is **parsed**:

|                       | `search_path`                 | operator   | result               |
| --------------------- | ----------------------------- | ---------- | -------------------- |
| Canonical production  | `"$user", public, extensions` | citext `~` | case-**insensitive** |
| Local sandbox harness | `"$user", public`             | text `~`   | case-**sensitive**   |

So `Booking_Upper` passed in production a guard that reads as "lowercase only",
while the pgTAP suite proved it rejected. Verified by probe in both environments,
not inferred. This is the "control that does not control anything" failure: a
constraint reading as stronger protection than it has.

0050 makes the intent explicit — four guards cast to `text` (case-sensitive,
the intended lowercase-snake-case rule) and `capability_requires_not_self` to
`lower()` (case-**insensitive**, which is the correct reading for citext foreign
keys onto a citext primary key: production was right there and the sandbox was
wrong). Six new pgTAP assertions test the **values**, not the constraint text, so
they mean the same thing under either runner.

**What was not affected, and why.** Behaviour driven by the citext _type_ rather
than by operator lookup is identical in both environments — a citext unique index
is case-insensitive in both, confirmed by test — so `shop_profiles_dedupe_unique`
never diverged and the import path's idempotency was never at risk. Function
bodies are also unaffected: all 24 set `search_path = ''`, so citext operators do
not resolve inside them in _either_ environment and their comparisons are
consistently text-based. The divergence is confined to expressions parsed at DDL
time: CHECK constraints and index predicates.

### The same shape exists elsewhere — 35 constraints, not repaired here

The pattern is platform-wide and pre-existing. Counted in production:

| Schema         | Constraints | Schema         | Constraints |
| -------------- | ----------- | -------------- | ----------- |
| `billing`      | 6           | `events`       | 2           |
| `discovery`    | 5           | `comms`        | 2           |
| `bti`          | 4           | `social`       | 2           |
| `hlvs`         | 4           | `visibility`   | 1           |
| `identity`     | 3           | `entitlements` | 1           |
| `integrations` | 3           | `platform`     | 1           |
|                |             | `provisioning` | 1           |
|                |             | `ai`           | 1           |

Some are cosmetic (`*_key_format`). Some are not: `providers_credential_is_vault_ref`
in `ai` and `billing`, `credentials_ref_is_vault_ref` in `social`,
`connections_credential_is_vault_ref` in `integrations`, and
`tenants_slug_format` in `platform` all read as stricter than they are.

These are deployed constraints on live schemas. Repairing them is a separate,
owner-approved change with its own blast radius; rewriting them unannounced
would be a second incident, not a fix. They are reported rather than repaired.

---

## Addendum — 2026-09-10: 0052 applied, and the fingerprint that disagreed

`owned_website` (migration 0052) was applied to canonical production
(`mvvtngiopdrgiedjmhfb`) under CEO approval. It is the first capability to come
through 0048's gate, and the only one in the catalog now marked `available`.

Security advisors: **36 → 36**, no net-new findings. The nine new
`SECURITY DEFINER` functions do not appear in the
`authenticated_security_definer_function_executable` lint for the same reason the
earlier twenty-four do not — `barberos` is not in the PostgREST allow-list — and
all four new tables carry SELECT policies, so none appears in
`rls_enabled_no_policy` either.

Production state after the apply, by query: 10 `barberos` tables, 4 capability
gate triggers, 5 `barberos.*` permissions, 1 capability at `available`,
`owned_website` at version 2, **0** rows in `barberos.sites`, **0** rows in
`barberos.tenant_capabilities`. Nothing but schema was written.

### The fingerprint differed, and the difference was citext again

Per the previous addendum's lesson, the apply was transcribed and therefore
verified rather than trusted: the same normalized fingerprint — over the four new
tables' columns, constraints, policies, RLS flags, triggers and grants, the nine
new functions, both new enums, and the permission, role-permission and capability
rows — was computed on the local mirror and on production and compared.

It **did not match** on the first comparison. Ten of the eleven components were
identical; `fns` was not. Narrowing it: all nine function bodies were
byte-identical (`md5(prosrc)` and length equal on both sides), so the difference
was in the signature rendering, and it was one parameter:

|                      | `pg_get_function_identity_arguments` for `upsert_site` |
| -------------------- | ------------------------------------------------------ |
| Canonical production | `p_slug citext`                                        |
| Local sandbox        | `p_slug extensions.citext`                             |

The same type, printed differently, because production's `search_path` carries
`extensions` and the sandbox's does not — the identical mechanism recorded above
as defect 2, surfacing this time in output formatting rather than in operator
resolution. Normalized for schema-qualification, both sides give
`a0c31416669a57cc0e7a4fd542a7f62d`.

Worth stating plainly: this was a false positive, and it is what a verification
step is supposed to do. A fingerprint that never disagrees is not evidence.

### Still open

The 35 weak citext CHECK constraints listed in the previous addendum are
**unrepaired**, including the four vault-reference guards and
`platform.tenants_slug_format`. Repairing them is still a separate,
owner-approved change.

Nothing hosts the rendered page. `barberos.site_content()` returns the content and
`_shared/barberos/site_render.ts` turns it into HTML, but no service serves that
HTML at an address a customer could visit. Until there is one, a shop can fill in
its page and still have no page.

---

## Addendum — 2026-09-10: serving the pages, and the address they do not have

Migration 0053 and `supabase/functions/site` turn a published row into a page a
customer can open. Both are **built and applied/deployed nowhere** as of this
entry.

### The wrapper argument, settled the other way

`public.barberos_published_site()` is the one function PostgREST can see, and it
was written `SECURITY INVOKER` first, on the reasoning that a wrapper holding no
privilege of its own is a smaller thing to have sitting in an HTTP-exposed
schema — and that it would stay out of the
`authenticated_security_definer_function_executable` advisory that every
existing `bti_*` / `graph_*` wrapper appears in.

The pgTAP run refused it: `permission denied for schema barberos`. An INVOKER
wrapper executes as `anon`, so `anon` needs `USAGE` on schema `barberos` for the
inner call to resolve at all. That is the real price, and it is much higher than
the advisory:

| Wrapper          | What `anon` can reach                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| SECURITY INVOKER | schema `barberos`, bounded by every function in it having revoked PUBLIC |
| SECURITY DEFINER | exactly two functions, both `STABLE`, both with an empty `search_path`   |

PostgreSQL grants `EXECUTE` to `PUBLIC` on a new function by default, and
revoking it is something each migration has to remember. Counted in the mirror
at the time of writing: **5 of 19** `barberos` functions still carry that
default. All five are trigger functions, which refuse to run outside a trigger,
so nothing is exposed today — but "nothing, provided every future migration
remembers" is an unchecked invariant, and it would have been load-bearing for an
unauthenticated caller.

So the wrappers are `SECURITY DEFINER`, `anon` gets no reach into `barberos` at
all, and the test asserts the trade rather than the intention:
`has_schema_privilege('anon','barberos','usage')` is false, and calling
`barberos.published_site()` by its real name as `anon` raises 42501.

### A draft and a wrong slug are the same answer

`published_site()` returns NULL for a draft, for an unpublished page and for a
slug nobody has used, and the server renders one byte-identical 404 for all
three. If the layers distinguished them, anyone with a wordlist could enumerate
which shops have pages they have not published. This is asserted twice — once in
SQL, once over HTTP.

### The sitemap is deliberate

`barberos_published_sitemap()` lists every published slug, which is an aggregate
view of who Herman Legacy Digital's live customers are. That is the trade: a page
nothing links to is a page no search engine indexes, and local search is the
entire reason `owned_website` exists. It lists published pages only, so
unpublishing removes a shop from it — a control the shop already has, in the same
place.

### What this does NOT answer

The audit's `owned_domain` finding is still open. These pages are served at a
Supabase Functions URL, and a URL under `*.supabase.co` is not "a domain the shop
owns" — which is the specific finding all 5 platform-only shops in the WNY list
were marked down for. Serving is solved; the address is not.

Per-shop custom domains cannot be delivered by this function alone: TLS for an
arbitrary domain terminates before the request reaches it, so a `custom_domain`
column added today would be a control that controls nothing. What it needs is a
domain and a proxy in front, and choosing the domain is an access decision, not
an engineering one.

### Also not done

Nothing counts a page view. "Did anyone visit my page" is the obvious next
question a shop will ask, and the honest answer today is that the platform does
not know. It is deliberately not guessed at.
