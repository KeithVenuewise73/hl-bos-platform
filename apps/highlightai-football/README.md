# HighlightAI Football

> Upload the game. Pick the player. HighlightAI does the rest.

Next.js app for the HighlightAI Football workflow: upload film, name an athlete,
watch HighlightAI find his plays, keep the clips you want, export a reel.

## Running it

```bash
pnpm --filter @hl-bos/highlightai-football dev     # http://localhost:4600
pnpm --filter @hl-bos/highlightai-football build
pnpm --filter @hl-bos/highlightai-football test
```

## Two modes, and no third

| Mode     | When                                                                    | What it shows                                                           |
| -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **demo** | No database configured, or `HIGHLIGHTAI_MODE=demo`                      | A synthetic game, analysed by the real engine, labelled on every screen |
| **live** | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set | Real uploaded film                                                      |

There is **no fallback from live to demo**. If the database is missing, screens
say the database is missing — they do not quietly show synthetic plays and let a
coach believe they are looking at their team. `HIGHLIGHTAI_MODE=live` cannot force
live mode without a database either; the dangerous direction is closed.

Demo mode carries a banner on every screen. It is not dismissible.

## Screens

Dashboard · Upload Game · Game Processing · Select Player · Player Confirmation ·
Game Analysis · Detected Plays · Highlight Editor · Reel Preview · Export ·
Players · Player Profile · Games · Settings · AI Debug View

`/api/health` reports liveness **and** data mode, so a demo instance cannot sit
in production unnoticed.

## Things this app deliberately does not do

**No fake video player.** In demo mode there is no video file, so the stage draws
the field and the tracker's real detection boxes. A play button over nothing
teaches the user the product is broken before they reach the part that works.

**No disabled-but-unexplained buttons.** Upload and Render are disabled in demo
mode and say why.

**No borrowed numbers.** Live mode with nothing uploaded shows an empty state,
not the demo's statistics.

**No GPU work here.** This app renders decisions made by
`@hl-bos/highlight-football` and orchestrates a separate worker. Video analysis
never runs in a serverless function.

## Where the numbers come from

Every screen reads one memoised analysis produced by the engine (`src/lib/analysis.ts`).
One analysis, many views — so the Detected Plays list, the Game Analysis panel,
the Highlight Editor and the debug view cannot disagree about what the AI
concluded.

`src/lib/format.ts` renders an unmeasured value as the words "Not measured",
never as `0%`.
