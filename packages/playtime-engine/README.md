# @hl-bos/playtime-engine

The game participation engine. A log of timestamped events in; an accurate
picture of who played, for how long, and whether a configured minimum is being
met, out.

No UI. No database. No network. **No running timer.**

## Why it is its own package

PlayTime Tracker is the first product to need this arithmetic. It is not the
last: AthleteHuddle, CoachesHuddle, OrganizationHuddle, GameTracker and 5-Star
Sports Media all need to answer "how long did this athlete actually play". A
Venuewise service is something you lift out of one product intact — not
something you re-derive from a React component four times and then spend a
season reconciling.

So the engine depends on nothing but `zod`, and knows nothing about Supabase,
React, localStorage or a screen.

## The one design decision that matters

**Duration is always the difference between two recorded instants. It is never
a counter that something has to keep incrementing.**

A running timer is a promise the operating system does not keep:

| What happens on a real sideline  | What a `setInterval` does       | What this engine does                   |
| -------------------------------- | ------------------------------- | --------------------------------------- |
| Coach switches to the camera app | Throttled, then suspended       | Nothing — the arithmetic runs on return |
| Phone locks in a pocket          | Stops firing                    | Nothing                                 |
| OS kills the app for memory      | Stops forever, silently         | Nothing — the log is on disk            |
| App reopened an hour later       | Total is short and nobody knows | Same answer, to the second              |

Every assertion in `acceptance.test.ts` that involves backgrounding, locking or
killing the app is modelled as what it actually is at this layer: a stretch of
time in which no code ran and no event was recorded. The numbers do not move.

## The model

```
events ──▶ buildTimeline ──▶ spans where the clock was running
   │                              │
   └────▶ on-field spans ─────────┴──▶ overlap ──▶ seconds played
```

An athlete's playing time is the **overlap** of "they were on the field" and
"the clock was running" — never one alone. Standing on the field through a
fourteen-minute halftime is not fourteen minutes of participation, and a report
that says otherwise is the last report that coach trusts.

## Idempotency

Every event carries a UUID minted on the device before any write is attempted.
That id is the row's primary key on the server, so a retried sync cannot create
a second record. `normalizeLog` enforces the same rule locally, for logs that
arrive twice through restore or merge, and `player_in` for an athlete already on
the field is ignored rather than opening a second concurrent session — the one
duplicate that would silently double an athlete's minutes.

`mergeLogs` is a **union**, not "server wins": the device is the only witness to
a tap made in a dead zone.

## Compliance states

The target is always the user's own configuration. This engine makes no
league-specific claim, and the shared report says so in as many words.

| State          | Meaning                                                                           |
| -------------- | --------------------------------------------------------------------------------- |
| `safe`         | Already met the target, or on pace to meet it                                     |
| `at_risk`      | Still reachable, but behind the pace it needs — raised while there is time to act |
| `below_target` | Cannot reach it even by playing every remaining second                            |
| `no_target`    | No target configured. Stated, never invented                                      |

## Tests

93 tests, including a full 20-athlete four-quarter game with rotation every two
minutes. The strongest of them is a conservation identity: with eleven athletes
on the field for every second of the clock, the sum of all individual playing
times must equal exactly `11 × regulation`. A dropped substitution or a
double-counted one breaks that equality immediately.

```
pnpm --filter @hl-bos/playtime-engine test
```
