# BTIC V1 — screenshots

Captured with headless Chromium against the app running locally with the local
dev bypass (`HLD_DEV_CLIENT=1`, non-production) so the authenticated views render.
In production these routes are auth-gated by the middleware and never indexed.

| File                                       | View                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `desktop-01-executive-home.png`            | Executive Home (`/intelligence`)                |
| `desktop-02-venuewise-overview.png`        | Venuewise Overview + bounded search box         |
| `desktop-03-timeline.png`                  | Timeline (all phases, in order)                 |
| `desktop-04-reports.png`                   | Reports — current truth vs. retained history    |
| `desktop-05-report-current-vs-history.png` | Report detail — current truth + version history |
| `desktop-06-decisions.png`                 | Executive Decisions (the four owed)             |
| `desktop-07-artifacts.png`                 | Artifact References (incl. PR #29)              |
| `desktop-08-intelligence.png`              | Intelligence Records (with confidence + gaps)   |
| `desktop-09-search-results.png`            | Bounded search results for “pricing”            |
| `mobile-01-executive-home.png`             | Executive Home (390w)                           |
| `mobile-02-venuewise-overview.png`         | Venuewise Overview (390w)                       |

Regenerate: run the app locally with `HLD_DEV_CLIENT=1` and screenshot the routes
at 1280w (desktop) and 390w (mobile).
