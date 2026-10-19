# HLG Presence Scanner — Phase 1

Finds local businesses with a weak online presence, shows exactly why, and ranks
them. Internal only, in the local Development Control Center at **/presence**.
It looks at public websites and Google listings. It never contacts anyone,
publishes anything or sends a message.

| Where             | What                                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| Engine            | `packages/presence-scanner` (no storage, no UI, no AI in the score)         |
| Console           | `apps/control-center/src/app/presence`, `lib/presence*.ts`, `lead-board.ts` |
| Leads on disk     | `apps/control-center/.data/presence-scanner/` (gitignored)                  |
| Google Places key | Connections page → `GOOGLE_PLACES_API_KEY` in `.env.local` (gitignored)     |

## What was reused, not rebuilt

| Need                      | Existing HL-BOS part reused                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Fetch a website safely    | `supabase/functions/_shared/discovery/scan.ts` `runScan` (SSRF, redirects, size, content type) and `url.ts` |
| Read a homepage           | `_shared/discovery/extract.ts` `extractFindings`                                                            |
| Judge an existing website | `_shared/discovery/rubric.ts` (`rubric-0.1.0`)                                                              |
| Scrub secrets from errors | `_shared/ai/redact.ts`                                                                                      |
| Suggest HLG services      | `@hl-bos/bti-engine` `analyzeGrowth` / `GROWTH_MAP`                                                         |
| Lead stages               | `visibility.prospect_stage` (migration 0017) — every stage maps onto it                                     |
| Geography                 | hl-jobscout's USPS gazetteer (Western New York subset) and distance formula                                 |

The shared discovery files received behaviour-preserving strict-type fixes so a
Node package can import them (all 130 edge-function Deno tests still pass). The
edge worker `discovery-website-worker` is unchanged and still inert.

## How a scan works

1. **Source**: Google Places (New) Text Search, or a pasted list / CSV.
2. **De-duplicate**: by place ID, then website domain, then phone, then name +
   street address. Facebook pages count by their full address, never by
   `facebook.com`.
3. **Inspect** each website through the existing scanner: robots.txt first;
   Facebook / Instagram / link-in-bio / retired `business.site` addresses are
   recognised from the address and never fetched; only the homepage is read.
   If the computer is offline, websites are "not checked", never "broken".
4. **Qualify**: operating, matches the vertical, has a contact path, not a
   national chain in that vertical, inside the radius. Failures are "excluded"
   with the reason; doubts go to "needs review"; a reviewer can override.
5. **Score** with `presence-opportunity-0.2.0` and **rank**: qualified first,
   then highest score.

## Opportunity Score `presence-opportunity-0.2.0`

0.2.0 (Phase 3A) adds the **professional-services** vertical: conversion priorities
consultation 4, call 3, form 3, services 3, email 2, case studies 2, process 1,
industries 1, about 1; extra checks for service area, testimonials, statistics,
placeholder (555) numbers, privacy policy and business structured data. A new evidence
status, **Requires manual verification**, covers what a web page cannot prove
(testimonials, statistics, placeholder-looking numbers) and is never scored. The five
Phase 1 verticals score exactly as under 0.1.0. A website can also be inspected from a
**saved copy** of its homepage (`saved-copy.ts`), every finding labelled as such.

0–100; higher = bigger opportunity. Deterministic and versioned
(`packages/presence-scanner/src/score.ts`). Every point names a rule ID and the
findings behind it. Missing data is **not checked** and earns nothing;
`checkedMax` says how many of the 100 points had evidence either way.

| Component (max)                  | Rules                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website presence & quality (30)  | `W.no_site` 30 · `W.social_only` 30 · `W.retired_site` 30 · `W.link_in_bio` 27 · `W.broken` 24 · working site: `W.rubric` up to 20 from the HL-BOS rubric |
| Conversion gaps (20)             | Per vertical (below). No own website or broken site: 20                                                                                                   |
| Reviews (15)                     | `R.no_reviews` 9 · `R.very_few_reviews` (<10) 7 · `R.few_reviews` (<25) 4 · `R.rating_low` (<3.8) 6 · `R.rating_below` (<4.2) 3                           |
| Google profile completeness (15) | `P.no_website` 5 · `P.no_phone` 4 · `P.no_hours` 4 · `P.no_photos` 2 (Google data only)                                                                   |
| Search basics (10)               | `S.title` 3 · `S.meta` 3 · `S.structured_data` 2 · `S.https` 2; no own / broken site: 10                                                                  |
| Social & freshness (10)          | `SF.no_social_links` 6 · `SF.stale` (copyright 3+ years old) 4                                                                                            |

Conversion rules per vertical (each sums to 20):

| Vertical                   | Gaps scored                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| Contractor / home services | form 6 · click-to-call 5 · services 4 · email 3 · pricing 2           |
| Salon / barber             | booking 7 · click-to-call 4 · pricing 4 · directions 3 · services 2   |
| Restaurant / bar           | menu 6 · ordering 5 · directions 4 · click-to-call 3 · reservations 2 |
| Trainer / coach            | booking 7 · click-to-call 4 · form 4 · pricing 3 · services 2         |
| Youth sports               | registration 7 · email 4 · click-to-call 3 · directions 3 · pricing 3 |

The weights are a first draft. Changing any number means a new version string.

## Google Places: cost, storage, attribution

Checked against Google's published pages on 2026-10-14; re-check before raising the budget.

- **Cost.** The field mask includes phone, website, rating, review count and
  hours, so every request bills as **Text Search Enterprise**: US$35 per 1,000
  requests at the first tier, 1,000 free per month for that SKU. One request
  returns up to 20 places; one query returns at most 60. Each scan records its
  request count and estimated cost.
- **Storage.** Place IDs may be kept indefinitely. Everything else Google
  returns is kept for **30 days** and then deleted from disk (including Google
  values quoted in finding labels, score explanations and qualification
  details); the lead keeps its place ID and needs a rescan to show Google data
  again. **Open question for counsel:** the lead's name, address, phone and
  website are kept as HLG's contact record after expiry. They often come from
  Google first.
- **Attribution.** Google data shown without a map is labelled "Google Maps" on
  the Lead Board, Lead Card, CSV and printable summary.
- **Never scraped:** Google search, Google Maps pages, Yelp, Facebook.

## Storage: today and later

Phase 1 stores leads locally behind `PresenceRepository`
(`packages/presence-scanner/src/repository.ts`). No migration was run.

How the same data maps onto the **existing** HL-BOS tables, for a future
repository over Supabase:

| Presence Scanner                                                                                                                        | Existing table / column                                                                         | Fits today?                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Prospect name, contact, city, website, vertical                                                                                         | `visibility.prospects` (business_name, contact_name, email, phone, industry, city, website_url) | Yes                                                                       |
| Lead stage                                                                                                                              | `visibility.prospects.stage` via `STAGE_TO_HLBOS`                                               | Yes (11 stages → 5 values)                                                |
| Opportunity Score total                                                                                                                 | `visibility.assessments.growth_score` (0–100)                                                   | Partly — it is a weighted mean of 16 manual categories, a different model |
| Findings with evidence                                                                                                                  | `discovery.evidence` (key, value, category, severity, confidence, detection)                    | Yes, via `discovery.record_scan_finding`                                  |
| Website scan                                                                                                                            | `discovery.website_scans`                                                                       | Yes, via `discovery.request_website_scan`                                 |
| Place ID, Google snapshot + expiry, qualification checks and override, reviewer corrections, notes, per-rule score breakdown, scan runs | —                                                                                               | **No home today**                                                         |

Because the last row has no home, Phase 1 stays local. The proposed migration,
**for review only and not applied anywhere**, is
[`proposed-migration.sql`](proposed-migration.sql). It adds a `presence`
schema keyed to `visibility.prospects` rather than a second prospects table.

## Known limitations (Phase 1)

- Only the homepage is inspected; a capability on another page is "not found",
  never "missing".
- Google Business Profile completeness comes from Places fields (website,
  phone, hours, photos). The Business Profile API only reads profiles you
  manage, so it is not used.
- Photo count is capped at 10 (Google returns at most 10 references).
- Imported leads have no Google data, so reviews and profile completeness are
  "not checked" unless the list includes a rating or review count.
- The national chain list is short and per vertical; regional chains are
  deliberately not on it.
- Leads live on one computer until the Supabase repository exists.
