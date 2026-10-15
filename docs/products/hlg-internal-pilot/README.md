# HLG internal pilot — Phase 3A

**For:** Keith Herman, CEO · **Author:** Claude (engineering) · **Date:** 2026-10-15
**Status:** Built and tested. Both website drafts are private, on the computer that builds
them, and await your review. Nothing is published, sent, migrated or deployed.

HLG's own companies are the first customers of the Presence Scanner and the Instant
Site Builder: **HLG Business Transformation** and **Herman Supply Chain Solutions
(HSCS)**.

## Where to look in the Control Center

| What                                | Where                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Create both company profiles (once) | **Business Profiles** → _Create HLG company profiles from approved facts_          |
| A company's verified facts          | `/profiles/hlg-business-transformation`, `/profiles/herman-supply-chain-solutions` |
| Its presence audit                  | the profile → _Run presence assessment_ → _Open the Lead Card_                     |
| Its website draft                   | the profile → _Build internal website draft_ → `/profiles/[id]/draft`              |
| Phone view, edit, approve, ZIP      | on the draft page                                                                  |
| Batch demos for prospects           | **Presence Scanner** → tick up to 10 qualified leads → _Build demos for selected_  |

On a computer that is online, the assessment inspects the live website; the
saved-homepage upload is only for when the live site cannot be reached.

## Where every fact came from

A field is **Verified** only when you supplied it or it is a matter of record in HLG's
own repositories. Everything else is **Unverified** (entered, for you to confirm) or
**Information required**, and stays off the page.

### HLG Business Transformation

| Field                                         | Value                                                                                                                                                                          | Status / source                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Brand name                                    | HLG Business Transformation                                                                                                                                                    | Verified — Phase 3A brief                                                |
| Description                                   | “…helps local and service-based businesses strengthen their digital presence, improve lead capture, modernize customer interactions and implement practical business systems.” | Verified — Phase 3A brief, verbatim                                      |
| Phone                                         | 716-220-7354                                                                                                                                                                   | Verified — confirmed by you in the brief                                 |
| Services (10)                                 | the ten in the brief                                                                                                                                                           | Verified — names from the brief; one-line descriptions restate each name |
| Products                                      | Presence Scanner, Instant Site Builder, HL-BTI: _In development_. TakeoutOS, SalonOS / BarberOS, Contractor Performance System: _Planned_                                      | Verified — status from the portfolio registry                            |
| Logo mark, colour                             | “HLG”, brass `#c0892d`                                                                                                                                                         | Verified — hermanlegacygroup.com source                                  |
| Service area                                  | Western New York                                                                                                                                                               | Unverified — the parent site's area; confirm for this business           |
| Industries                                    | contractors, salons/barbers, restaurants, local services                                                                                                                       | Unverified — inferred from the planned products; shown as _Sample_       |
| Email, privacy link, legal name, case studies | —                                                                                                                                                                              | Information required                                                     |

### HSCS

| Field                                                | Value                                                                                                                                                   | Status / source                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Headline                                             | Transportation & Operations Consulting supported with AI.                                                                                               | Verified — Phase 3A brief                                 |
| Description                                          | the canonical positioning statement (“…Thirty-five years of operational experience, enhanced by AI.”)                                                   | Verified — HSCS Commercial Foundation v1.0 §3.1, verbatim |
| Services and experience areas                        | operational assessments, dispatch and routing, final/middle mile, white glove, warehousing, contractor and driver performance, AI-supported improvement | Verified — brief and Foundation §4.6                      |
| Website                                              | hermansupplychainsolutions.com                                                                                                                          | Verified — the CNAME file                                 |
| Colour                                               | steel `#34506b`                                                                                                                                         | Verified — HSCS Design System v1.0 §4                     |
| Service area                                         | All 48 continental states                                                                                                                               | Unverified — stated on the current site only              |
| Phone, email, privacy link, legal name, case studies | —                                                                                                                                                       | Information required                                      |

## What the audits found

| Business                    | Score (0–100, higher = bigger gap)         | Evidence                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HLG Business Transformation | 60, on the 60 points that could be checked | No website of its own (the parent site does not mention it). Google listing and reviews: not checked (no Places key).                                                                                                                     |
| HSCS                        | 21, on 70 checked points                   | Inspected from a saved copy of the current homepage (GitHub `herman-supply-chain` @ `0971d06`). Has a consultation call to action, services, about and process. Missing: industries section, case studies, structured data, social links. |

**Requires manual verification on the current HSCS site** (found by the scanner, and
none of it is used in the draft): “Est. 1994”, “30 Yrs”, “$2.4M+ average annual
savings”, “18.3% average cost reduction”, “200+ engagements”, “$180M+ recovered”,
“98.2% client retention”, client testimonials, the phone number 1-800-555-1234 (the 555
exchange is reserved for examples), and info@hermansupplychain.com (a different domain
from the site). The repository also holds a KPI dashboard page that names a retailer;
no client is named on the draft. The HLG parent site lists (716) 555-0142, also a 555
number.

## Decisions that stay with you

The drafts' launch-readiness lists name each one: the email address and any other
missing facts, the domain or subdomain, hosting, where form messages go, the privacy
policy, and the explicit approval to publish. HSCS also has two taglines on record:
the brief's _Transportation & Operations Consulting supported with AI_ (used) and the
Commercial Foundation's _35 Years of Operational Experience. Enhanced by AI._

## Known limitations

- No live check has been run: this build environment has no internet, so HSCS was
  inspected from its saved homepage and Google data is not checked for either business.
- Credentials and certifications are refused even when verified; a verified
  certification would need a deliberate change to the claims check.
- A verified statistic containing a dollar figure is refused (the price rule); savings
  figures need a decision on wording before they can appear.
- Drafts and profiles live on the computer that builds them (`.data/`, never committed).
