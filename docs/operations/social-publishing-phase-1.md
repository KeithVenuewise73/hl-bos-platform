# HL Social Publishing — Phase 1

Publishing approved content from HLVS to **Herman Legacy-owned channels only**.
First consumers: the HomeHuddle "Morning Chaos" campaign (Venuewise) and HSCS
consulting content.

This is not a Buffer competitor. There is no client onboarding, no third-party
account connection, and no public product surface.

## Status, stated plainly

| Thing                                             | State                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Migration `0046`                                  | **APPLIED** to canonical production (HL-BOS Core, `mvvtngiopdrgiedjmhfb`) on 2026-08-26 under CEO approval. |
| Migration `0047`                                  | **APPLIED**. Forward-repair — see "The defect the advisor found" below.                                     |
| `social-token-refresh`                            | Built and unit-tested offline. **Not deployed.** Never run against a real token.                            |
| `social-publish-worker`                           | Built and unit-tested offline. **Not deployed.**                                                            |
| Facebook / Instagram / LinkedIn / TikTok adapters | Built and unit-tested against a stubbed HTTP layer. **None has ever contacted a real platform.**            |
| Channels connected                                | **None.**                                                                                                   |
| Anything published to a real audience             | **Nothing.**                                                                                                |

Verified locally, from empty, against PostgreSQL 17.6 with all 47 migrations
applied in order:

```
TOTAL: 909 passed, 0 failed        # supabase/tests, 44 files
26 passed, 0 failed                # supabase/functions/tests, edge layer
```

The production schema was then fingerprinted and compared to the local one —
table, column, check-constraint, policy, function, trigger, RLS-flag,
permission and grant counts, plus the full sorted lists of constraint and
function names. They are identical:

```
tables|columns|checks|policies|functions|rls_on|rls_forced|triggers|perms|role_perms|cred_policies|authed_creds|anon_creds|authed_complete
     6|     80|    14|       5|       16|     6|         6|       8|    4|        12|            0|           f|          f|              f
```

`cred_policies = 0` and `authed_creds = anon_creds = f` are the security claim,
confirmed on production rather than asserted.

### The advisor gate result, in full

|                   | Before | After | Net new |
| ----------------- | ------ | ----- | ------- |
| Security findings | 35     | 36    | **+1**  |

The one net-new security finding is `rls_enabled_no_policy` (INFO) on
`social.credentials`. That table having no policy **is** the design — it is the
same pattern the database already carries for `ai.guardrails` and
`integrations.webhook_events`. It is a finding we intend to own, not a
regression.

Performance advisors report 16 INFO findings naming `social`: 9 `unused_index`
(the tables are empty and have never been queried — these will clear
themselves) and 6 `unindexed_foreign_keys`. The 6 are real but mild, and match
a platform-wide pattern: the database carries 262 of that same finding today.
No index was added purely to silence them, because on empty tables that would
simply convert 6 INFO findings into 6 different ones.

### The defect the advisor found

The post-apply advisor check raised a second, unpredicted finding:

```
[WARN] function_search_path_mutable
       Function `social.deny_attempt_mutation` has a role mutable search_path
```

That was a real defect in 0046. It was the one function in the migration
written without `set search_path = ''` — every other function in the schema has
it. A trigger function with a mutable search_path resolves unqualified names
against whatever the caller has set, which on the table that holds the
append-only publish evidence is not acceptable.

Two things followed:

1. **0047 repaired it forward**, rather than editing 0046. 0046 was already
   applied and its checksum is locked in `.hlbos/migration-lineage.json`;
   editing it would make the repo file disagree with what production ran, which
   is exactly the drift this platform has spent two phases reconciling.

2. **A test now guards the whole schema.** `46_social_publishing.sql` asserts
   that _every_ function in `social` pins its search_path. That assertion was
   confirmed to fail when the original 0046 body is restored, and to pass after
   0047 — it is a guard that bites, not one that passes vacuously.

The honest reading: the local pgTAP suite did not catch this and the Supabase
advisor did. The gap is now closed for this schema.

## What was built

Six tables in a new `social` schema, all additive:

| Table                     | Purpose                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `social.accounts`         | The owned channels. Instagram rows must carry a linked Facebook Page id — enforced by CHECK, because an unlinked account can never publish. |
| `social.credentials`      | A Vault **reference** plus expiry metadata. Never a token. Zero RLS policies, zero grants.                                                  |
| `social.posts`            | Body, campaign, status, schedule, approver.                                                                                                 |
| `social.post_targets`     | Post × account fan-out. Own status, own retries, own idempotency key, own external post id.                                                 |
| `social.publish_attempts` | Append-only. Every request, response and error. Trigger-enforced immutable.                                                                 |
| `social.media_assets`     | Storage path plus the public https URL Instagram needs to fetch the bytes itself.                                                           |

Two edge functions, in the order the brief required:

1. **`social-token-refresh`** (daily) — built first, before any publish call.
   Refreshes anything expiring within 14 days. Every outcome, success or
   failure, goes through `social.record_credential_refresh()`, which writes a
   warning-severity security event on failure. The function returns HTTP 500
   when anything needs a human, so the cron run itself goes red rather than
   reporting green with bad news in the body.
2. **`social-publish-worker`** (minute) — claims due targets with
   `FOR UPDATE SKIP LOCKED`, runs one adapter per platform, writes an attempt
   row on every try, and completes each target independently.

## Three deliberate departures from the brief

Each of these makes the module safer or more honest than specified. They are
listed here rather than buried, because a departure nobody mentions is a
departure nobody can overrule.

**1. Credentials are Vault references, not stored tokens.**
The brief proposed `social_credentials` holding "token, refresh token,
expires_at". Every other credential in this platform — `ai`, `billing`,
`comms`, `integrations` — is a CHECK-enforced `vault:` reference, and
`scripts/check-migrations.sh` exists to keep it that way. So the table stores
the reference and the expiry (which the refresh cron genuinely needs) and the
token lives in Vault. The brief's actual requirement — unreachable from `anon`
and `authenticated` — is met more strongly: the table has **zero RLS policies
and zero grants**, so it is unreadable through PostgREST by anybody at all,
platform admins included.

**2. TikTok has its own terminal status, `delivered_to_inbox`.**
An inbox upload is a draft. Recording it as "published" would be a claim that
something is live when it is not. A `tiktok_inbox` target that reports
`published` is rejected by the database, and a post whose only successes are
inbox deliveries never rolls up to `published`.

**3. An unconfirmed publish is never retried.**
None of these four APIs offers an idempotency key on its publish endpoint. The
per-target `idempotency_key` prevents a _duplicate target_, and the
`FOR UPDATE SKIP LOCKED` claim prevents two workers racing — but neither helps
when a request is sent and no answer comes back. That request may or may not
have created a live post. Retrying it is how one scheduled item becomes two
live ones, so the adapters mark that outcome terminal, the worker passes
`p_terminal => true`, and the target fails visibly with an error that says to
check the channel. **Failing visibly beats double-posting silently.** This is
the one place the module deliberately chooses a worse-looking outcome.

## Down-migration

`0046` is purely additive: it creates a new schema and modifies no existing
table, so undoing it restores the prior state exactly.

```sql
DROP SCHEMA IF EXISTS social CASCADE;
DELETE FROM identity.role_permissions WHERE permission_key LIKE 'social.%';
DELETE FROM identity.permissions      WHERE key            LIKE 'social.%';
DELETE FROM events.subscriptions      WHERE key            LIKE 'social.%';
```

This is also recorded in the migration's own `-- rollback:` header, which
`scripts/check-migrations.sh` requires.

Two consequences worth knowing before running it: the `social.publish_attempts`
evidence is destroyed with the schema, and any Vault secrets created for social
channels are **not** removed by it — they are Vault objects, not schema
objects, and must be deleted separately.

## Out of scope for Phase 1

- X / Twitter — paid API tier, not worth it.
- LinkedIn **company pages** — `w_organization_social` needs Community
  Management API partner review (weeks to months, and generic-scheduler use
  cases get rejected). The adapter refuses an organization URN outright rather
  than failing obscurely at the API.
- TikTok **direct posting** — an unaudited client is forced to `SELF_ONLY`
  visibility server-side, the posts are invisible, and passing the audit later
  does not retroactively publish them. Building it would produce a feature that
  looks like it works and does not.
- Client account onboarding and Meta App Review (Phase 4, only if ServiceOS
  proceeds).
- Analytics ingestion (Phase 1b), ServiceOS event-triggered content (Phase 3).

## What is still needed before anything real publishes

These are access decisions, not engineering tasks. Each unlocks something
specific.

1. **The exact channel list** — which Facebook Pages, which Instagram accounts,
   which LinkedIn profile, which TikTok accounts.
2. **Confirmation each Instagram account is Professional (Business or Creator)
   and linked to a Facebook Page.** A personal account cannot publish through
   the API at all. The schema refuses to register an unlinked one, so this is
   worth checking before anything else.
3. **A Meta app (Business type)** with the Instagram and Facebook Login for
   Business products.
4. **A tester or admin role on that app for each account.** Standard Access
   covers accounts with a role on the app, so no App Review is needed.
5. **A LinkedIn developer app** with the "Share on LinkedIn" product.
6. **A TikTok developer app** with Content Posting API, inbox scope only. TikTok
   also needs the media domain verified in its portal before it will pull video.

Everything not blocked by these is finished.

## Deployment state

The migrations are applied. The edge functions are **not**, and no cron is
scheduled — so the token-refresh job has never run and the publish worker has
never claimed a target in production.

Still to do, once channels exist:

```
supabase functions deploy social-token-refresh
supabase functions deploy social-publish-worker
select cron.schedule('social-token-refresh',  '0 6 * * *', $$ ... $$);
select cron.schedule('social-publish-worker', '* * * * *', $$ ... $$);
```

Secrets required in the function environment, never in the repo:
`META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
Per-channel tokens go into Vault and are referenced by
`social.set_credential()`.

### A finding about the apply path itself

`0046` and `0047` were applied individually and verified, not pushed as a
batch through `.github/workflows/db-migrate.yml`. That was deliberate, and the
reason matters:

The canonical project holds roughly **forty migrations that are not in this
repository** — three separate lineages (`dma_*`, `disco_*`, `jobscout_*`) — and
about **fourteen of our own migrations were applied under different version
identifiers** than the repo files carry (0029, 0032–0045). `.hlbos/canonical.json`
still declares `notYetAppliedOrdinals: []` and states the applied set is
"0001–0028, matching the repo". That declaration is stale.

The consequence is concrete: `db-migrate.yml`'s `drift-check` would fail
against the current declaration, and `supabase db push` — which applies
everything the remote lacks _by version_ — would attempt to re-run around
twenty migrations the database already has under other names, including the
0042 evidence backfill and the 0044 extraction run. Re-running those is not
idempotent.

Reconciling this is its own piece of work (the precedent is Phase XI-2I,
"Option D" — repo filenames reconciled to production's applied versions with
content preserved). It is recorded in `.hlbos/milestone.json` as a blocker.
`canonical.json` has deliberately **not** been rewritten here: editing it to
match reality without doing the reconciliation would turn a visible problem
into an invisible one.

## Running the tests

```bash
supabase test db                              # includes 46_social_publishing.sql
deno test --no-check supabase/functions/tests/ # includes social_publishing.test.ts
```

Both are wired into CI as the existing `database-tests` and `functions-tests`
jobs; neither needed a workflow change.
