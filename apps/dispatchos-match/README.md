# DispatchOS Match (app)

Backhaul load matching, ranked by what each load earns. Engine:
[`packages/dispatch-match`](../../packages/dispatch-match/README.md).

**Start it** from the Development Control Center: _Your software → Start
DispatchOS Match_. It builds, starts on http://localhost:4700 and only offers
the link once `/api/health` answers.

Works anywhere in the US. Trucks and loads are located by `City, ST`, ZIP or
`lat, lon`, resolved on the server from a national ZIP dataset.

## What's on the page

- **Fleet picker** — two sample fleets (Western NY bulk, Dallas regional) or
  **Your own fleet**, which starts empty and holds only what you import.
- **Sample-data banner** — always visible on a sample fleet.
- **Assumptions** — fuel, overhead, speed, road-mile factor, dwell, driver-day
  hours, and every input to the score. The formula is printed underneath and
  the ranking recomputes as you type. A value that is not a number turns red
  and is ignored, never read as zero.
- **One panel per truck** — ranked loads with pay, deadhead, loaded miles,
  $/loaded mile, $/total mile, operating cost, contribution and "vs. empty
  home". Click a row for the cost, timing and score breakdown and any warnings.
  "Why not the others?" lists every load that failed a hard constraint and why.
- **Not matched against spot freight** — dedicated-lane trucks and the reason.
- **Loads no truck can take** — with the reason per truck.
- **Add trucks from CSV** (own fleet) and **Add loads from CSV** (any fleet)
  — paste rows; bad rows are refused with the reason (unknown place, missing
  UTC offset, bad number…). Imported rows live in the browser tab only.
- **Check a location** — shows exactly where a city, ZIP or coordinate lands
  before you import.

## Not built

No routing API (miles are estimates), no load board, no saved data, no lane
history (so no return-load probability). US only — other countries need a
place resolver.
