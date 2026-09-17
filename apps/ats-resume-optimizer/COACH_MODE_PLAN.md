# Coach mode — the smallest change that would support it

**Status: not built. This is a plan, deliberately not an implementation.**

A career coach with 5–40 clients is the customer segment the commercial assessment
identified as strongest, because unlike a job seeker they do not churn when one search
ends. But nothing in this sprint assumes they exist. This document exists so that the
decision to build it later is cheap, and so that nothing shipped now quietly makes it
expensive.

---

## What the architecture already gets right

The product model is **not** account → resume. It is already:

```
account (owner_id)
  └── candidate_profile
        ├── career_facts
        ├── resumes
        ├── job_postings → analyses → generated_resumes
        └── applications
```

Every domain table carries `profile_id` as well as `owner_id`. The app happens to use
one profile per account, but nothing in the schema requires that. **A coach is an
account with several profiles.** That is the whole feature, and it is most of the way
there by accident of a sensible data model.

The one place the assumption is baked in is `requireProfileId()` in `src/lib/actions.ts`,
which resolves "the" profile for the signed-in user and creates one if absent.

---

## Schema impact

**Additive only. No table needs restructuring, and no existing row needs migrating.**

| Change                                                 | Why                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `ats.candidate_profiles.label text`                    | "Sarah — VP Ops search". A coach needs to tell profiles apart; today the profile is implicitly "you". |
| `ats.candidate_profiles.archived_at timestamptz`       | Clients finish. Deleting their history is the wrong default.                                          |
| `ats.candidate_profiles.client_consent_at timestamptz` | See _Billing and legal_ below. Nullable; the UI records when the coach confirms the client agreed.    |

No new RLS policies are required. Existing policies scope by `owner_id = auth.uid()`,
which is already exactly right: a coach sees their own profiles and nobody else's.

Estimated: one migration, ~20 lines, additive, no backfill.

---

## Authorization model

**Do not build sharing, invitations, or client logins.** The moment a client has their
own login, the question "who owns this data" stops being obvious, and a data processing
agreement stops being optional. That is a legal project, not a feature.

The coach owns the records. The client is a subject of them, not a user of the system.
This is how outplacement and resume-writing engagements already work in practice, and
it keeps the RLS model exactly as it is — which is the model that has been verified
against a real database.

If clients ever need their own access, that is a different product and should be
priced and reviewed as one.

---

## UI impact

Four changes, none of them a redesign:

1. **A profile switcher in the sidebar.** Reads the profile list, sets a cookie, done.
2. **`requireProfileId()` reads that cookie** instead of taking the first profile.
   Single function, and it is the only place the one-profile assumption lives.
3. **A "New client" form** — label plus the consent checkbox.
4. **Dashboard scoped to the selected profile.** Every query is already filtered by
   `profileId`; the dashboard simply needs to pass the selected one.

Estimated: 1–2 days, most of it the switcher.

**Explicitly not in scope:** a client-facing portal, per-client billing, team seats,
role hierarchies, white-labelled exports, bulk import. Each of those is a plausible
request and none is needed to find out whether coaches will pay.

---

## Billing impact

None, for the pilot. The $99 Career Coach Pilot is a Stripe Payment Link and a manually
provisioned account; nothing in the app checks entitlement, and nothing needs to until
a coach has paid twice.

When it does matter, the smallest honest mechanism is a per-account profile cap read
from configuration — not metered billing, not seats. A coach on the pilot gets 3
profiles; a paid coach gets 40. That is one integer and one check in the "New client"
form.

**Do not** build usage metering. The cost of serving a coach is near zero — the rules
engine runs every feature with no AI key — so metering would measure something that
does not cost us anything.

---

## The one thing that needs a decision before this is built

A coach uploading a client's resume puts a third party's personal data in our system,
and that third party never agreed to our terms. The consent timestamp above records
that the coach asserts they have permission, which is a control, not a legal opinion.

**A data processing agreement for this case is not written.** `/privacy` and
`/data-handling` both say so on screen. That gap should close before coach mode is
marketed, not after — it is cheap now and awkward later.
