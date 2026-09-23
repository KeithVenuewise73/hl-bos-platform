# DispatchOS Match (app)

Backhaul load matching, ranked by what each load earns. Engine:
[`packages/dispatch-match`](../../packages/dispatch-match/README.md).

**Start it** from the Development Control Center: _Your software → Start
DispatchOS Match_. It builds, starts on http://localhost:4700 and only offers
the link once `/api/health` answers.

## What's on the page

- **Sample-data banner** — always visible.
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
- **Add loads from CSV** — paste rows; bad rows are refused with the reason.
  Imported loads live in the browser tab only.

## Not built

No routing API (miles are estimates), no load board, no saved data, no lane
history (so no return-load probability).
