# @hl-bos/dispatch-match — DispatchOS Match engine

Finds backhaul freight worth taking on the way home and ranks it by what it
actually earns, not just by whether it fits.

Pure TypeScript. No network, no map API, no secrets. The same engine runs in
the browser (the app) or on a server.

## How a match is decided

1. **Tenant scope.** Only this fleet's trucks and loads are considered. Another
   fleet's freight does not even appear as a rejection.
2. **Dedicated-lane equipment is set aside.** A truck with
   `dedicatedLaneOnly: true` (the sample tanker) is reported with its note and
   never ranked against spot freight.
3. **Hard filters**, in this order. The first one a pair fails is recorded as a
   plain-English reason:
   - the shipper accepts this equipment type;
   - the equipment type can haul this commodity class, after the truck's own
     exclusions/inclusions (e.g. a poly-lined dump body that won't take scrap);
   - weight ≤ payload; cubic yards ≤ body (for equipment that measures volume;
     if the shipper gave no volume, the match carries a warning instead);
   - deadhead ≤ the truck's limit; delivery within the service radius of home;
   - the truck reaches pickup before the window closes, delivers before the
     delivery window closes, and is unloaded before its availability ends.
     Driving is simulated with an 11 h drive / 10 h rest rule.
4. **Price, score, rank** what survives.

## The numbers

| Metric                  | Formula                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| loaded miles            | origin → destination                                                           |
| deadhead miles          | truck's empty location → origin                                                |
| fuel                    | total miles × fuel $/mile                                                      |
| driver                  | total miles × $/mile, **or** on-duty hours ÷ hours-per-day × $/day             |
| overhead                | total miles × overhead $/mile                                                  |
| total operating cost    | fuel + driver + overhead                                                       |
| revenue per loaded mile | pay ÷ loaded miles                                                             |
| revenue per total mile  | pay ÷ (loaded + deadhead)                                                      |
| projected contribution  | pay − total operating cost                                                     |
| vs. empty home (extra)  | pay − (cost of deadhead + loaded + delivery→home − cost of driving home empty) |

"Per-mile" pay is computed on the engine's loaded-mile estimate, and the match
carries a warning that the broker's mileage governs.

### Score (0–100)

```
score = 100 × (wC × C + wR × R) / (wC + wR)
C = clamp((contribution − C_floor) ÷ (C_target − C_floor), 0, 1)
R = clamp(($/total mile − R_floor) ÷ (R_target − R_floor), 0, 1)
```

Defaults: `wC = 0.6`, `wR = 0.4`, `C_floor = $0`, `C_target = $1,000`,
`R_floor = $1.00`, `R_target = $3.50`. All six are adjustable, and so is which
contribution feeds `C` — the full-trip figure (the default) or the "vs. empty
home" figure, which is how a dispatcher actually values a backhaul.

Anchors are fixed rather than relative to the other loads on the list, so a 70
means the same thing tomorrow as today, and the best load on a bad day does not
get a flattering 100.

### Return-load probability

Only produced from recorded `LaneObservation` history (weeks in which
qualifying loads were seen on the lane), and only once there are at least
`minLaneHistoryWeeks` (default 8) weeks of it. Otherwise the result carries a
reason and **no number**. The sample data has no history, so it is never shown.

## Extending

- **New equipment type:** pass it to `buildEquipmentRegistry([...])`. No code
  change.
- **New commodity class:** it is a string; add it to the relevant equipment
  types' `allowedCommodityClasses`.
- **Real road miles:** implement `DistanceProvider` (PC\*MILER, Google, HERE)
  and pass it as `distance`. Today miles are great-circle × 1.2, labelled
  "est." everywhere.
- **Load boards:** implement `LoadBoardAdapter` in `sources.ts`. None exists
  yet, and the app does not pretend otherwise.

## Simplifications (stated, not hidden)

- Road miles are estimated, not routed.
- Hours of service: the 11 h driving limit and 10 h rest are modelled; the
  14 h on-duty window and 30-minute break are not.
- Per-day driver pay is pro-rated by on-duty hours.
- One load per truck per run; the engine flags when the same load ranks for
  more than one truck but does not solve fleet-wide assignment.

## Sample data

`@hl-bos/dispatch-match/demo` — a Western NY bulk fleet (2 dump trailers,
2 flatbeds, 1 pneumatic tanker) and 12 regional loads. Invented for
demonstration; not any carrier's real trucks, rates or freight. It is a
separate entry point so production code cannot import it by accident.
