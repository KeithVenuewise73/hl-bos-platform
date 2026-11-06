# @hl-bos/visual-review

A browser-based visual review of a business's website. A real Chromium,
driven by Playwright, opens the homepage and the most relevant pages it links
to. For each page it captures desktop (1366px) and phone (390px) screenshots
and reads back what a visitor would see:

- the menu
- headings and programs/services pages
- calls to action
- forms, which are never submitted
- booking and registration links, with known providers named (SportsEngine,
  LeagueApps, Vagaro and others, from the Presence Scanner's list)

## Read-only, enforced in code

| Rule                                                                                                                                 | Where                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Every request that is not GET/HEAD/OPTIONS is refused at the network layer: no form, booking or sign-up can happen                   | `browser.ts`, `context.route` |
| Every request is checked against the scanner's address rules, and every resolved IP against the private/loopback/metadata block list | `checkHost`                   |
| robots.txt is read and obeyed for every host, under the Presence Scanner's name, which the browser announces                         | `robotsAllowed`               |
| A 401/403/429, a security block page or a CAPTCHA ends all requests to that host, with no retry and no workaround                    | `STOP_HOST`                   |
| The only click is opening a mobile menu toggle                                                                                       | `openMobileMenu`              |
| Off-site booking providers: the landing page only, at most 2 providers                                                               | `planPages`                   |

## What a review may claim

`coverage` is one of:

| Coverage        | Meaning                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `complete`      | The homepage and every selected page rendered, with both captures of the homepage |
| `partial`       | The homepage rendered, but some selected pages could not be viewed                |
| `blocked`       | The homepage was refused, challenged or disallowed                                |
| `failed`        | A technical failure stopped the review                                            |
| `not_available` | No browser is installed on this computer                                          |

`visualFindings()` describes only pages that were viewed. Absence is scoped to
those pages and stated with medium confidence. The Revenue Center
(`packages/growth-intelligence/src/review.ts`) refuses design or functionality
claims about a working site without `visual.*` evidence from a `complete` or
`partial` review.

## Running it

From the console: open a lead, then **Visual review (real browser)** → **Run
visual review**. The first time, the console offers **Install the browser**,
a one-time download of about 150 MB. Evidence is kept in
`apps/control-center/.data/visual-reviews/<id>/`: `review.json` plus the
screenshots.

## Tests

- `classify.test.ts`: the decision rules. Runs everywhere; no browser needed.
- `browser.test.ts`: real Chromium against local synthetic sites (normal, a
  JavaScript-drawn page, a Cloudflare 403, a 200 challenge page, robots.txt,
  a 429 partway through, a wide page, a private address). It skips itself
  where no browser is installed.
