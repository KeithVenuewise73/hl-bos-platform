# Barbershop Transformation Cockpit

The **internal operator console** for the BarberOS managed service. It is the
first application on this platform that calls a `barberos_*` RPC at all.

It runs one workflow end to end:

```
prospect → discovery call → audit → recommendations → proposal → sale
        → onboarding → capability delivery → client records → retention → reporting
```

## What this is not

- **Not the customer-facing site.** That is `apps/herman-legacy-digital`.
- **Not the CEO console.** That is `apps/control-center`, which stays
  localhost-only because it shells out to git and pnpm. This one does not.
- **Not a client portal.** A barbershop owner does not sign in here. The people
  who use it work for Herman Legacy.

## It adds no schema and no second implementation of anything

Every read and write is a permission-checked RPC in `public`. There is no
`.from()` anywhere in this app, no service-role key, and no route handler that
could hold one — it is a static export that talks to Supabase from the browser
with the publishable key plus the operator's JWT. Row Level Security and the
RPCs are the security boundary; the key is not.

`src/lib/api.ts` is the only file that names an RPC. If a call is not in that
file, the app does not make it.

Three functions in `src/lib/model.ts` mirror a rule the database also enforces
(`proposalProblems`, `offerLineFor`, `bundleStatus`). That is deliberate and is
not a second authority: the database refuses regardless, and these exist only so
an operator reads _"the review engine has not shipped"_ while filling the form
instead of a raw `23514` after submitting it. Where the two could ever disagree,
the database wins and the screen shows its message verbatim.

## What it refuses to do

These are the reason the app exists in this shape, not incidental polish.

| It will not                                          | Because                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer a capability the catalog has not shipped       | `enforce_proposal_honesty()` rejects it, and only 2 of 16 capabilities are `available`. The builder derives `deliverable_today` from the catalog rather than letting anyone type it.            |
| Mention a `deferred` capability in a proposal at all | Deferred is a decision _not to build_, not a roadmap entry. It is not even offered as a checkbox.                                                                                               |
| Show a composite score without its coverage          | A bare `0` cannot be told apart from _"nothing ever reached this dimension"_. In production 35 runs read completed at 1 of 1 scoring 0, and 5 read partially completed at 0 of 1 with no score. |
| Let an unevidenced finding read as a fact            | Every finding carries a `verified` / `inferred` / `unknown` label and a coloured edge, and a run where nothing is evidenced says so in a banner above everything else.                          |
| Create a client tenant without a sale                | `barberos_provision_client` refuses a prospect with no accepted proposal, and refuses one already onboarded.                                                                                    |
| Claim it sent anything                               | No SMS or email provider is configured on this platform. The control says **Mark as sent**, and the retention screen is a call list for a person.                                               |
| Report revenue, traffic, rankings or conversion      | There is no payment provider, no analytics SDK and no Search Console or GBP integration in this repository. The reporting screen says so, in a panel, by name.                                  |
| Offer a bundle that cannot be applied                | `apply_bundle()` is all-or-nothing and every seeded bundle contains something unbuilt, so the Apply button is disabled with the reason beside it.                                               |

An empty panel that explains itself beats a green one that lies — so `Loaded`
takes a **required** `empty` prop. A panel with no data cannot omit saying why.

## Dependencies you must know about

This app depends on **migration 0056**, which is written, applies from empty
locally and is covered by 75 pgTAP assertions, but is **UNAPPLIED to any
project pending CEO approval**. Without it these have no browser-reachable
path and their screens will fail:

- the capability catalog reads (`barberos_catalog`, `barberos_capability_state`)
- the shop upsert (`barberos_save_shop`)
- capability enablement (`barberos_enable_capability` / `_disable_` / `_apply_bundle`)
- onboarding (`barberos_provision_client`)
- the agency list and the pipeline read (`barberos_audit_my_agencies`, `barberos_audit_pipeline`)

The 22 `barberos_audit_*` RPCs it also uses are live: migration 0055, applied to
canonical production on 2026-09-17.

## Permissions

The console can do nothing the signed-in account is not already permitted to do,
and it hides a control rather than offering one that will be refused.
`barberos_audit_my_agencies()` returns a `can` object computed from the real
permission checks, so a missing button means a missing permission — never a
hardcoded role name.

Onboarding needs **two** permissions: `transform_audit.proposal.manage` on the
agency, and the platform-wide `platform.tenant.create`. An account with only the
first sees the reason instead of the button.

## Run it

```
pnpm --filter @hl-bos/barberos-cockpit dev     # http://localhost:4700
pnpm --filter @hl-bos/barberos-cockpit test
pnpm --filter @hl-bos/barberos-cockpit build
```

Build-time configuration (both browser-safe by the platform's ENV_SPEC):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

With either missing, the app says so on a card and renders nothing else. It does
not fall back to sample data.

## Tests

- `src/lib/model.test.ts` — 59 assertions over the pure logic: stage derivation,
  the score/coverage rule, evidence wording, capability blockers, bundle
  all-or-nothing, and every branch of the proposal honesty check.
- `supabase/tests/56_barberos_cockpit_api.sql` — 75 pgTAP assertions over the
  RPCs this app calls, including the refusals.
