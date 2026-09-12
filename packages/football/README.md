# @hl-bos/football

The football domain, as code.

Pure and deterministic — no network, no database, no AI provider, no React.
Football FilmStudy AI depends on it; AthleteHuddle, PlayingTime and HighlightAI
can depend on it later without inheriting FilmStudy's schema. That is what keeps
"explosive play" meaning one thing across the Venuewise portfolio instead of
three products quietly disagreeing.

## What is in here

| Module          | What it owns                                                                     |
| --------------- | -------------------------------------------------------------------------------- |
| `vocabulary.ts` | Canonical personnel, formations, run/pass concepts, coverages, fronts, pressures |
| `situations.ts` | Explosive / red zone / third down / goal line, and the down-and-distance buckets |
| `grading.ts`    | The `++ / + / 0 / − / −−` ladder, the numeric scale, and season rollups          |
| `tendencies.ts` | Tendency and rate aggregation **with a sample floor**                            |
| `confidence.ts` | How a model's confidence is shown to a coach                                     |
| `search.ts`     | Film-search query parsing                                                        |

## The three rules this package exists to enforce

**1. A tendency below the sample floor is not reported.**
`tendency()` and `rate()` return either a distribution with its sample size or
an explicit refusal carrying the number of confirmed plays they actually had.
There is no default percentage. A "third and long: pass 81%" computed from four
snaps is noise wearing a percent sign, and a coach cannot tell by looking.

**2. Untagged is not zero.**
`summarizeGrades` returns `average: null` for a player nobody has graded — not
`0`, which renders on a player page as a claim about a kid. `averageYards`
excludes untagged plays from its denominator rather than bucketing them, because
a rate whose denominator is padded with untagged film measures tagging progress
and presents it as football.

**3. A model suggestion is never settled.**
`describeConfidence` bands the score instead of printing three decimals, and its
guidance says "confirm" even at 99%. `canAutoConfirm()` returns `false`,
permanently, so that rule has one name in the codebase rather than being
re-argued at each call site.

`parseFilmQuery` follows the same principle from the other direction: its most
important output is `unrecognized`, the words it could not place, so a search
that matched half of what the coach asked cannot look like one that matched all
of it.

## Not a closed vocabulary

Football is not a fixed list of terms, and a tagging screen that rejects a
coach's own concept name is a tagging screen they stop using. `isCanonical*`
tells you whether a term is one the platform knows; nothing here refuses a term
it has not seen. `conceptFamily()` returns `null` for an unknown concept rather
than guessing, because a guess there corrupts every run/pass split downstream.

## Test

```bash
pnpm --filter @hl-bos/football test
```
