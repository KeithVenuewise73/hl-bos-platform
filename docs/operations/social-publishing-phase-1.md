# HL Social Publishing — Phase 1

Publishing approved content from HLVS to **Herman Legacy-owned channels only**.
First consumers: the HomeHuddle "Morning Chaos" campaign (Venuewise) and HSCS
consulting content.

This is not a Buffer competitor. There is no client onboarding, no third-party
account connection, and no public product surface.

## Status, stated plainly

| Thing                                             | State                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Migration `0046`                                  | Written. Applies cleanly from an empty database. **UNAPPLIED** to any Supabase project — no approval has been given. |
| `social-token-refresh`                            | Built and unit-tested offline. Not deployed. Never run against a real token.                                         |
| `social-publish-worker`                           | Built and unit-tested offline. Not deployed.                                                                         |
| Facebook / Instagram / LinkedIn / TikTok adapters | Built and unit-tested against a stubbed HTTP layer. **None has ever contacted a real platform.**                     |
| Channels connected                                | **None.** See "What is still needed" below.                                                                          |
| Anything published to a real audience             | **Nothing.**                                                                                                         |

Verified locally, from empty, against PostgreSQL 17.6 with all 46 migrations
applied in order:

```
TOTAL: 908 passed, 0 failed        # supabase/tests, 44 files
26 passed, 0 failed                # supabase/functions/tests, edge layer
```

The full acceptance scenario from the brief — one post, four targets, one
deliberately forced to fail, every attempt logged, the failure blocking nothing
— runs as `supabase/tests/46_social_publishing.sql` and passes. It runs against
the mock adapters, so it proves the **platform** works end to end. It does not
prove Facebook accepted anything, because no Facebook Page is connected yet.

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

## Deploying it (engineer's job, not the CEO's)

Not yet done, and not to be done without approval:

```
supabase db push                          # applies 0046
supabase functions deploy social-token-refresh
supabase functions deploy social-publish-worker
select cron.schedule('social-token-refresh',  '0 6 * * *', $$ ... $$);
select cron.schedule('social-publish-worker', '* * * * *', $$ ... $$);
```

Secrets required in the function environment, never in the repo:
`META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
Per-channel tokens go into Vault and are referenced by
`social.set_credential()`.

## Running the tests

```bash
supabase test db                              # includes 46_social_publishing.sql
deno test --no-check supabase/functions/tests/ # includes social_publishing.test.ts
```

Both are wired into CI as the existing `database-tests` and `functions-tests`
jobs; neither needed a workflow change.
