# @hl-bos/highlight-football

The football intelligence behind HighlightAI. Pure, deterministic TypeScript: no
network, no GPU, no media toolchain.

The computer-vision worker produces observations — boxes, colours, attempted
number readings, motion. This package decides what they **mean**: which track is
the athlete, which plays involve him, how much they are worth, where each clip
starts and ends, and what the reel contains.

That split is the reason the product's judgement is testable. Every decision a
user sees is made by a function in here and covered by a test that runs in about
a second on any machine.

## What it decides

| Module         | Question it answers                                                  |
| -------------- | -------------------------------------------------------------------- |
| `color`        | Is that jersey blue, and is it the same blue at night?               |
| `jersey`       | What number is this, given that most frames cannot read one?         |
| `reid`         | Is the player who came out of the pile the one who went in?          |
| `tracking`     | Which tracks are _this_ athlete, and where does a human overrule us? |
| `segmentation` | Where are the plays, and when was the ball snapped?                  |
| `involvement`  | What did he do, judged against what his position is _for_?           |
| `highlight`    | Is this worth clipping, and where does the clip start and end?       |
| `crop`         | Where does a 9:16 window go so the play is still legible?            |
| `spotlight`    | How do we identify him without covering the football?                |
| `reel`         | What goes in, in what order, and what got left out and why?          |
| `pipeline`     | How far along is this job, honestly?                                 |
| `metrics`      | Did we actually find his plays?                                      |
| `analyze`      | All of the above, in order.                                          |

## The rules it will not break

**A confidence is a belief, not a decoration.** Every number is computed. A value
that is not known is `null` — never `0`, never a plausible-looking default.

**Refusing is a valid answer.** `temporalVote` returns `null` when two numbers
are evenly supported. `bestMatch` returns `null` when two teammates look equally
like him. `assignTeam` returns `null` for a referee. In football these are common
and the honest output routes the play to human review; a guess puts another
child in the reel.

**A human always wins.** A player lock or exclusion outranks every model output
in its frame range, by precedence rather than by weighting — blending a human
correction into a weighted average lets a confident model overrule a person, and
that is how people stop correcting anything.

**Never cut off the conclusion of a play.** The clip end is computed from the end
of the _play_, not from a fixed duration after the snap. `clampWindow` will
shorten the lead-in before it will shorten the tail.

**Scoring pushes downward, never up.** Thin visibility and shaky identity both
reduce a highlight score. Nothing inflates one.

## Demo mode

`@hl-bos/highlight-football/mock` generates a synthetic game as geometry —
occlusions, camera pans, unreadable numbers, a player leaving frame — and then
the real engine has to work it out. The demo can get things wrong, and when it
does that is a finding about the engine rather than a bug in the mock.

Every mock adapter declares `kind: "demo"`, and `isFullyReal()` is
all-or-nothing: a real detector with a demo event classifier still produced
partly synthetic football, and the honest label for that is demo.

## Fixtures

Seven named scenarios, one per way football film breaks a tracker:
`blue_23_vs_white`, `white_7_vs_dark`, `confusable_teammates`, `occluded_player`,
`number_invisible`, `camera_pan`, `leaves_and_reenters`. They are asserted end to
end in `analyze.test.ts`.

```bash
pnpm --filter @hl-bos/highlight-football test
pnpm --filter @hl-bos/highlight-football typecheck
```
