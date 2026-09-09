# WNY 50 barbershop list — what was imported and analysed

**Date:** 2026-09-09 · **Project:** HL-BOS Core (`mvvtngiopdrgiedjmhfb`)
**Tenant:** Herman Legacy Digital (`8a669381-…`) · **Campaign:** `wny_barbers_50`
**Source:** `WNY_50_Barber_HLD_Prospect_List.xlsx`, sheet "50 Barber Prospects"

## What is in production

|                  |                                                                   |
| ---------------- | ----------------------------------------------------------------- |
| Shops imported   | **50** (`visibility.prospects` + `transform_audit.shop_profiles`) |
| Analysed         | **40**                                                            |
| Awaiting a fetch | **10**                                                            |
| Findings         | 45                                                                |
| Recommendations  | 40                                                                |
| Dimension scores | 40                                                                |

Every row is traceable to its sheet row via `shop_profiles.source_row`.

## How the 40 split

| Outcome                                    | Shops | Score  | Confidence | Run status          |
| ------------------------------------------ | ----- | ------ | ---------- | ------------------- |
| No dedicated website found                 | 35    | **0**  | inferred   | completed           |
| Booking-platform presence, no owned domain | 5     | _none_ | unknown    | partially_completed |

The 35 are scored 0 because there is genuinely nothing there — not because
something scored badly, and the stored note says exactly that.

The 5 carry **no score at all**. Two facts are known from the list (there is a
booking presence; there is no owned domain) and nothing else is, because no page
was fetched. The dimension is therefore `unknown` and the run is
`partially_completed`. The two facts are still stored as findings at `inferred`
confidence — a finding's confidence is its own, independent of the dimension's.

**Why the five are kept apart from the thirty-five.** Collapsing them would put
"there is no way to book you online" in front of a shop that is already on
Booksy. That is false and it would lose the call. Their hook is about ownership
instead: _"Your only web presence is a page on someone else's booking platform,
and so is your audience."_

## The 10 not analysed

These carry a real URL and have **no run at all**, because this build
environment's network policy denies outbound HTTPS to arbitrary hosts. An
un-audited shop is represented by the absence of a run — never by a run that
guesses.

Armstrong's Barber Shop · Buffalo Barber Society · Burns Barber Shop ·
Dark Horse Barber Studio (Downtown) · Dark Horse Barber Studio (East Aurora) ·
Legacy Barbershop · Pieroni Barber Studio · Slawich Cut N' Shave (Amherst) ·
Slawich Cut N' Shave (North Tonawanda) · Truth Barbershop

Truth Barbershop's URL is a GlossGenius-hosted page, so it will almost certainly
come back as the sixth "owned domain missing" shop once fetched — but that is a
prediction, and predictions are not stored.

## The recommended module, across the campaign

| Module                       | Shops | Shipped?                      |
| ---------------------------- | ----- | ----------------------------- |
| Owned Website / Landing Page | 40    | **No — catalogued `planned`** |

Every analysed shop points at the same capability, and BarberOS reports honestly
that it has not been built. Nothing in this campaign recommends `booking`: the
five platform shops can already be booked, and the thirty-five have no site to
put booking on yet.

## How it was produced

1. `scripts/import-prospects.mts` parsed the workbook by header name into
   normalized rows (10 with a URL, 40 with a research note).
2. `transform_audit.import_shop()` wrote each row, acting as the HLD tenant
   owner. No permission check was bypassed.
3. `_shared/transform_audit/run.ts` — the real runner — computed every analysis.
   It produced exactly **6 distinct analyses** across the 40 shops, which is why
   the replay stores six templates and a row→template map rather than 40 copies.
4. Both steps were dry-run against a local PostgreSQL 17.6 carrying the same
   migrations, and verified by fingerprint before and after:

| Stage    | Local                              | Production |
| -------- | ---------------------------------- | ---------- |
| Import   | `e895b16ca28e005f63a8428c3a31e79c` | identical  |
| Analyses | `51e1c68cfcfc5dece015d027484b6ff7` | identical  |

`scripts/local-test/wny-import.sql` and `wny-analyses-replay.sql` are the exact
statements that ran.

## What this is not

- Not a fetch of any shop's website. Nothing was retrieved from any of the 50.
- Not a Google Business Profile, social or competitor analysis. Those dimensions
  exist in the schema, are not weighted by this campaign, and have no collector.
- Not a finished audit for the 10 with URLs. They are imported and waiting.
