# HLG SiteGen: Phase 1 design and decisions

Status: Phase 1 in progress on `claude/hlg-sitegen-architecture-tnh74y`.
Nothing here is applied to any Supabase project.

## What SiteGen is

A multi-tenant website generator sold by Herman Legacy Digital. Every site is a validated
JSON **SiteSpec**; one shared renderer turns a spec plus a vertical template into the
site. **The AI only ever produces or edits SiteSpec JSON**, never code or HTML, and an
invalid spec is rejected, never published.

## Tiers (entitlements are data)

|                  | Who edits                                                                      | AI                         | Domain         |
| ---------------- | ------------------------------------------------------------------------------ | -------------------------- | -------------- |
| Free             | Client: theme tokens, logo, one hero graphic, basic business info              | None, costs nothing to run | Subdomain only |
| Assisted         | HLG staff apply a client's change request, with AI help, after review         | Staff only                 | Custom allowed |
| Custom build     | HLG, in admin, with full SiteSpec editing, tracked as a project with a quote   | Staff only                 | Custom allowed |

Code never asks "which tier". It asks `entitlements.has_feature(tenant, 'sitegen.…')` or
`sitegen.limit_for(tenant, 'sitegen.…')`. Tiers are rows in `billing.plans`. A test fails
if a tier name appears in any SiteGen function body.

## Decisions made on the CEO's behalf (2026-11-20, "defer to you")

| Question                         | Decision                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Production migrations not in repo | Inventory done; import deferred, needs a lineage ADR (`docs/operations/production-migration-drift-2026-11-20.md`) |
| `site_domains`                   | Phase 4, with the domain provider                                                         |
| Staff access                     | Platform-level permissions (`sitegen.admin.*`), not membership in each client tenant      |
| BarberOS                         | Left alone; import into SiteGen later                                                     |
| Plans                            | Free plus one internal "HLG-managed" plan, placeholders, **no prices**                    |
| Change request statuses          | submitted, in_progress, review, approved, published, plus rejected and withdrawn          |
| Project statuses                 | lead, quoted, accepted, in_progress, delivered, cancelled                                 |
| Assisted allowance               | Counts on approval; over the limit staff see a flag and decide                            |
| AI cost attribution              | Against the client's tenant                                                               |
| Apps                             | One authenticated app (client dashboard and staff admin) plus a separate public host app  |
| Free signup                      | Verified email; `sitegen.max_sites` defaults to 1 and is a data limit                     |
| Logos                            | PNG, JPEG, WebP only; SVG excluded (scripts)                                              |
| Custom domains                   | Cloudflare for SaaS recommended; **CEO decision pending** (Namecheap registrar, no domain chosen yet) |

## What Phase 1 builds

**Migration `0060_sitegen_core`** (additive, rollback documented, 109 pgTAP assertions):

- `sitegen.verticals`, `theme_fonts`, `reserved_slugs`, `library_assets`: catalogs as data.
- `sites`, `site_versions` (immutable by trigger), `site_assets` (files live in
  `storage_meta`, under the tenant's prefix).
- `plan_limits`, `tenant_limit_overrides`, `usage_counters`, with an atomic
  `consume()`. 12 simultaneous calls against a limit of 3 gave exactly 3 successes.
- Writes only through `create_site`, `save_version`, `publish`, `suspend_site`,
  `unsuspend_site`, `register_asset`, `confirm_asset`, `set_limit_override`.
- **Edit scopes enforced in the database.** `save_version` compares the new spec with the
  base version: changing theme needs `sitegen.edit_theme`, profile `sitegen.edit_profile`,
  hero choice `sitegen.edit_hero`, anything else `sitegen.edit_content`. A tampered client
  cannot go beyond its plan.
- **Only `publish()` puts a site live** (trigger-enforced; even a superuser UPDATE is
  refused). Rollback is publishing an older version. A person always clicks.
- **No claim without a source.** Every entry in `claims` needs `source.type`
  (`intake` or `user`) and `source.field`, checked in the database whoever wrote it.
- Theme: `#rrggbb` colors, fonts by key from an allowlist (no CSS injection), logo must
  be a confirmed upload of the same site, at most 4000 px, 2 MB.
- No public or anon surface. The schema is not API-exposed; the host app reads a
  published site through `sitegen.published_site()`, executable only by `service_role`.

**Packages** `@hl-bos/sitegen-spec` and `@hl-bos/sitegen-renderer`: the zod schema that
mirrors the database rules, and the barber renderer (zero client JavaScript).

## Deliberately not in Phase 1, and why

| Left out                                    | Why                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `generation_jobs`, `patches`, `change_requests`, `projects` | No writer exists until Phase 3/4; a table nobody can write is a control that controls nothing |
| `leads`                                     | Needs the public form endpoint (Phase 2)                                      |
| Free signup (`start_free_site`)             | Phase 2: needs the email-verified path, rate limits and a zero-price subscription path |
| Image re-encode / EXIF strip                | Happens in the upload Edge Function (Phase 2); the database only caps type and size |
| Hero library images                         | Table is empty on purpose: no pictures have been curated, none invented       |
| Advisor check on the new objects            | Not run: it needs the objects applied. See "Verification" below              |

## Verification, honestly

- Run locally on PostgreSQL 17.6 with real pgTAP: 60 migrations apply from empty,
  **1533 assertions pass, 0 fail** (1424 existing + 109 new).
- `check-migrations.sh` and `check-lineage.mjs` pass.
- **Not verified:** the Supabase security/performance advisors against the new schema
  (needs it applied to a project or a preview branch); the same tests on the real
  Supabase stack in CI (the local harness emulates `auth`, so CI is the control); any
  Lighthouse score.
- The advisor baseline taken from production before this work: 29 INFO (RLS, no policy),
  6 WARN (mutable search_path), 2 (extensions in public), 3 anon and 23 authenticated
  SECURITY DEFINER functions in `public`, leaked-password protection off. The new
  schema is built to add none: every table has a policy, every definer function pins
  `search_path`, nothing is added to `public`. That is checked by tests, not yet by the
  advisor.

## Risks to watch

- The host app needs the service key to read published sites (server side only), unlike
  the Executive Portal, which uses none. It can only execute `published_site()`.
- Free hosting on our domain invites abuse: reserved slugs and the suspend switch exist;
  a content policy and takedown process still need to be written.
- The database cannot validate every section's shape; the zod schema does, and the two
  can drift. The spec package pins the shared rules with tests.
