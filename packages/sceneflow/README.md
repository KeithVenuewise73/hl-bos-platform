# @hl-bos/sceneflow

The SceneFlow AI continuation engine.

Section 66 of the product brief says the thing this package exists to honour:

> Do not reduce this product to "upload photo → prompt → image".

So it isn't. The engine is the part between the photograph and the model —
cast understanding, character lock, scene lock, spatial map, interaction graph,
story planner, continuity engine, prompt composition — and the safety boundary
that every request crosses before a provider is contacted.

Pure and deterministic. No network, no model SDK, no secrets. That is what makes
the safety boundary testable without a provider key, and it is why the whole
package runs in under a second.

## What is here

| Module          | Responsibility                                                          |
| --------------- | ----------------------------------------------------------------------- |
| `types.ts`      | The shared vocabulary. A scene is a structure, not a paragraph.         |
| `vocabulary.ts` | The **closed set** of interactions, their intimacy, their reciprocals.  |
| `policy.ts`     | The deterministic real-person safety pre-gate.                          |
| `cast.ts`       | Cast construction and CharacterLock.                                    |
| `spatial.ts`    | The semantic spatial map.                                               |
| `graph.ts`      | Interaction graph validation, reciprocity, bystanders, intimacy cap.    |
| `direction.ts`  | `normalizeCustomDirection` — typed English into structure.              |
| `sceneLock.ts`  | What is held, what may change, and who wins when they conflict.         |
| `continuity.ts` | `buildContinuityContext` — what the next scene inherits.                |
| `planner.ts`    | Story presets and 1 / 3 / 6-scene plans.                                |
| `prompt.ts`     | Server-side prompt composition. The only place a prompt string is made. |
| `credits.ts`    | Costs, settlement, refunds, entitlements.                               |
| `qa.ts`         | Output checks and the one-retry rule.                                   |
| `providers.ts`  | Image + moderation + analytics interfaces. No vendor.                   |
| `pipeline.ts`   | The gate order, written once so no caller can reorder it.               |
| `storyboard.ts` | Panel-by-panel generation and partial recovery.                         |

## The three decisions worth knowing about

**1. The interaction vocabulary is closed.**

An act with no member in `vocabulary.ts` has no structured representation, so it
cannot be composed into a prompt — whatever text accompanies it. The text filter
in `policy.ts` is the second line of defence, not the first. Adding a member to
that set is a policy change, not a feature.

**2. The pipeline fails closed.**

`PipelineDeps.moderation` is non-optional _by type_. There is no "moderation
off" path to deploy by accident. The deterministic gate and the moderation
provider both have to pass, because the brief is explicit (§44) that a keyword
filter is not sufficient on its own — and a filter is all `policy.ts` is.

**3. Some requests are refused, not redirected.**

§2 asks that a blocked request be answered with the nearest permitted romantic
alternative. That is right for "too explicit". It is wrong for a request
involving a minor, a request framed as non-consensual, or one naming a public
figure. Those return `hardRefusal: true` and `alternative: null`, and
`direction.ts` hands back none of the recognised fragments — a refused request
should not be resubmittable one word at a time.

## What this package does NOT do

Stated plainly, because a README that implies otherwise is the same lie as a
green dashboard panel:

- **It does not generate images.** No image provider exists in this repository.
  `MockImageProvider` returns `mock://` paths and nothing else.
- **It does not moderate anything.** No moderation provider exists either.
  `policy.ts` is a deterministic keyword-and-structure gate, and it is
  documented as exactly that.
- **It does not detect people in a photograph.** `buildCast` takes subjects that
  detection already found. Nothing here looks at pixels.
- **It does not verify consent.** The attestation is two booleans the user set.
  It records what they stated; it proves nothing, and the product must not
  describe it as proof.

## False positives are a safety bug too

`policy.ts` has an explicit test file section for ordinary sentences that
contain substrings of blocked terms — "make minor adjustments to the lighting",
"run an analysis", "forced perspective", "a comic strip layout". A gate that
fires on those teaches people to route around it, and the routes they find work
on the real cases as well. Every ambiguous term is either absent with a comment
saying why, or narrowed to a phrase that cannot appear innocently.

## Tests

204, all passing, no network.

Two mutation checks were run against them rather than assumed:

- Disabling the policy pre-gate in `pipeline.ts` fails 3 tests.
- Disabling the intimacy ceiling in `graph.ts` fails 3 tests.

Three real defects were found by these tests during the build and are now
covered by regressions:

1. Leetspeak folding turned `18` into `i8`, so `under 18` could never match.
   Fixed by keeping both a plain and a folded reading of the text.
2. Bare `minor` in the age table meant "make minor adjustments to the lighting"
   was a hard refusal.
3. Reciprocal Affection added a third edge when the user had already staged both
   directions of a touch by hand.

And one bug the tests found in the interaction parser: ranking phrase matches by
length made "Have Person B kiss Person D while the others move closer" resolve
to _move closer_, silently dropping the actual instruction. Position now wins,
with length breaking ties.

```bash
pnpm --filter @hl-bos/sceneflow test
```
