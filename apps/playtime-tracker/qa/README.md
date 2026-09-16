# PlayTime Tracker — acceptance run

Drives the **real production build** in a real browser, through the acceptance
tests in the product brief. It is not a unit test with a browser attached: it
creates a team, types in twenty athletes, plays a game, backgrounds the app,
pulls the network out, kills the process, and then checks the report.

```bash
pnpm --filter @hl-bos/playtime-tracker build
node scripts/serve.mjs out 4700 &
pnpm --filter @hl-bos/playtime-tracker qa
```

`PLAYWRIGHT_CHROMIUM_PATH` points at a Chromium if one is already provisioned;
otherwise `npx playwright install chromium` fetches one.

## How the long waits are done

With Playwright's clock control, which replaces the page's `Date` and its
timers. That is exactly the right instrument, because the claim under test is
_"durations come from recorded instants, not from a timer that has to keep
running"_. Jumping the clock forward twelve minutes while running none of the
app's code is indistinguishable, from the app's point of view, from having been
suspended by the operating system — which is the thing that actually happens on
a sideline.

The clock is **paused** after installation, so only deliberate jumps advance it.
Without that, the seconds spent clicking leak into the game clock and every
assertion drifts by however long the browser happened to take. (That is not
hypothetical: the first run of this suite failed with `10:01` against an
expected `10:00`, and the extra second was the test's own clicking.)

## The assertion that matters most

```
individual minutes sum to eleven full games
```

Eleven athletes are on the field for every second of the tracked clock, so the
sum of all twenty individual playing times must equal exactly
`11 × elapsed`. A substitution counted twice, or dropped, breaks that equality
immediately — and no amount of plausible-looking numbers on screen can hide it.

## What this run does NOT prove

Uploading to Supabase. This build has no account service configured, so the run
exercises the device path only, and the app says so on screen rather than
implying a backup that is not happening. The queue logic is covered by
`@hl-bos/playtime-engine`'s tests, and the wire format by
`src/lib/sync.test.ts`, which checks every field this client sends against the
columns migration 0049 actually creates.
