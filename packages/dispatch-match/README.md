# @hl-bos/dispatch-match — DispatchOS Match engine

Finds backhaul freight worth taking on the way home and ranks it by what it
actually earns, not just by whether it fits.

Pure TypeScript. No network, no map API, no secrets. The same engine runs in
the browser (the app) or on a server.

**Location-independent.** Nothing in the engine knows about any region: a
truck or load is a latitude/longitude, and every limit (deadhead, service
radius, time windows) is per truck. Two sample fleets ship to prove it — a
Western NY bulk carrier and a Dallas regional carrier with a truck that starts
in Mountain time.

## Locations, anywhere in the US

`@hl-bos/dispatch-match/places` resolves what people actually write:

| Written as           | Example                                           |
| -------------------- | ------------------------------------------------- |
| City, state          | `Dallas, TX`, `Buffalo NY`, `St. Louis, Missouri` |
| ZIP (ZIP+4 accepted) | `14510`, `75201-1234`                             |
| City + ZIP           | `Dallas, TX 75201` (the ZIP wins)                 |
| Coordinates          | `42.886, -78.878`                                 |

Data: the `zipcodes` package (BSD) — 42,249 US ZIPs with coordinates across
all 50 states, DC and territories; a city's point is the median of its ZIPs.
Military APO/FPO codes have no location and are dropped. **Anything that does
not resolve is refused with a reason — never guessed.** This entry point loads
~5 MB of data, so it is server-side only (the app's import route uses it); the
browser bundle was checked and contains none of it.

## Time zones

Every timestamp must carry its UTC offset (`2026-09-29T08:00:00-05:00`); CSV
import refuses one without, rather than assuming the server's zone. Times are
shown in the zone they were written in — pickup times in the pickup's zone,
delivery in the delivery's — and the offset is printed whenever a trip crosses
zones (`Tue 29 Sep 06:00 UTC−6`).

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
- **A fleet's own trucks and loads:** `importTrucksCsv` / `importLoadsCsv`,
  with any `PlaceResolver` — the national one, or `placeListResolver` over a
  fleet's own yards. Row coordinates always win.
- **Outside the US:** the engine already works on coordinates; it needs a
  resolver for that country's places, and HOS settings for its driving rules.

## Simplifications (stated, not hidden)

- Road miles are estimated, not routed.
- Hours of service follow US federal rules (configurable numbers).
- Hours of service: the 11 h driving limit and 10 h rest are modelled; the
  14 h on-duty window and 30-minute break are not.
- Per-day driver pay is pro-rated by on-duty hours.
- One load per truck per run; the engine flags when the same load ranks for
  more than one truck but does not solve fleet-wide assignment.

## Sample data

`@hl-bos/dispatch-match/demo` — two illustrative fleets, each its own tenant:

- a Western NY bulk fleet (2 dump trailers, 2 flatbeds, 1 pneumatic tanker)
  and 12 regional loads;
- a Dallas regional carrier (flatbed, step deck, reefer, dry van — the reefer
  empty in Albuquerque, Mountain time) and 11 loads across TX, OK, LA and NM.

Invented for demonstration; not any carrier's real trucks, rates or freight.
It is a separate entry point so production code cannot import it by accident.
