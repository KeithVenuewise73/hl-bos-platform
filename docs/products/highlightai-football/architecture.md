# HighlightAI Football — architecture

> Find your player. Find every play. Build the highlights automatically.

## What it is

Upload a football game. Say which athlete to follow — colour and number. Get back
the plays he was in and a highlight reel of them.

Not a clipping tool. A player detection, tracking, play-segmentation and
highlight-generation platform, built for youth and high-school football first,
where the film comes from Hudl exports, Veo cameras, press boxes, end zones and
phones.

## Assembled, not rebuilt

HL-BOS already has identity, tenancy, permissions, audit, domain events and
storage metadata. HighlightAI adds none of those again.

| Need                       | Reused                                                   |
| -------------------------- | -------------------------------------------------------- |
| Users, tenants             | `identity`, `platform.tenants`, Supabase Auth            |
| Permissions                | `identity.has_permission()`, `identity.role_permissions` |
| Audit trail                | `audit.emit()`                                           |
| Domain events              | `events.emit()`                                          |
| App shell, CSP, middleware | the `apps/venture-studio` pattern                        |
| Deterministic video maths  | `packages/video-studio` conventions                      |

## The three components, and why they are three

```
  apps/highlightai-football          Next.js. Screens. No GPU, ever.
            │  reads
            ▼
  packages/highlight-football        The football judgement.
            │                        Pure, deterministic, no network.
            │  consumes observations from
            ▼
  services/highlight-cv              The GPU worker. Python, torch, FFmpeg.
            │  writes
            ▼
  supabase/migrations 0048           The `highlight` schema.
```

The split between the worker and the engine is the important one. Computer vision
needs a GPU and a large dependency tree; football judgement needs neither.
Separating them means every decision the product makes — is this your child, is
this play worth watching, where does the clip start — is covered by a test that
runs in about a second on any machine, with no video card and no video file.

It is also what makes Phase 3 possible. Football FilmStudy AI answers "what
happened on the play"; HighlightAI answers "which plays involve him". They share
`Game`, `Play`, `Player`, `PlayerTrack`, `FootballEvent` and `VideoTimestamp` and
read the same tracks rather than running the vision pipeline twice.

## The pipeline

```
upload → transcode → play segmentation → player detection → team classification
   → player tracking → jersey OCR → re-identification → field mapping
   → ball detection → possession → event detection → involvement
   → highlight scoring → clip generation → overlay → export
```

Seventeen stages, each with its own status, progress and error. Progress is
weighted by real wall-clock cost (detection and tracking dominate; they are the
only stages that touch every frame), and a stage that cannot estimate its
remaining work reports `null` rather than a number nobody computed.

## Model adapters

Nine interfaces — `PlayerDetector`, `TeamClassifier`, `JerseyNumberRecognizer`,
`PlayerTracker`, `PlayerReIdentifier`, `BallDetector`, `PlaySegmenter`,
`FootballEventClassifier`, `HighlightRanker` — declared identically in TypeScript
and Python. Swapping YOLO for RT-DETR, or ByteTrack for BoT-SORT, is a new
adapter and a config change.

Each adapter declares `kind: "real" | "demo"`, and that flag reaches the database
and the UI. `isFullyReal()` is all-or-nothing: a real detector with a demo event
classifier produced partly synthetic football.

## What the database refuses to allow

Migration 0048 makes three product claims structural rather than aspirational.

**1. A tenant cannot fabricate an AI result.** Detections, tracks, jersey
readings, team classifications, plays, ball tracks, events, involvement scores
and candidates have no write grant and no write policy for `authenticated`, and
no SECURITY DEFINER function exists that would write one. A parent cannot type a
tackle into their child's game, and neither can we through the UI.

**2. A reel cannot claim to be ready when it is not.** `status = 'ready'`
requires at least one clip and a rendered output object, enforced by trigger and
constraint.

**3. Demo output cannot pass as real.** A clip cut from a demo-analysed video
forces its reel to `is_demo` by trigger. No path — service-role included —
produces a reel claiming real analysis from synthetic football.

## Privacy

This schema holds video of children, so the defaults are enforced by the data,
not by a form:

- Every video, clip, reel and export is `private`.
- Leaving private requires a row in `highlight.sharing_consents`. For a minor,
  that row must name a guardian; the constraint refuses one that names nobody.
- Consent to a private link is not consent to publish. Separate scopes, separate
  records.
- A reel is only as shareable as the least-consented film it draws on.
- `training_opt_in` is false by default and is never set implicitly.

## Where the hard problems actually are

**Jersey numbers are unreadable in most frames.** The player is facing away, in a
pile, blurred, or the camera zoomed. Nothing in this system reads the number from
the current frame; it is voted on across a track, and frames that cannot read it
abstain rather than voting "unknown".

**Teammates wear identical uniforms.** A generic person-ReID embedding separates
people by clothing, which is exactly the signal football removes. So the
`PlayerSignature` combines the embedding with the voted number, the helmet and
pants colours, body proportions and a motion gate — and the motion gate is a hard
veto, because a confident wrong re-link silently puts another child in the reel.

**A camera pan looks like a play.** Segmentation runs on motion with the camera's
own motion subtracted, and thresholds are derived from each video's own
distribution rather than fixed constants.

**A left tackle never touches the ball.** Involvement is scored against what the
position is _for_. A reel built by looking for touchdowns tells a lineman's
family he did nothing all year.

**Lighting.** Every colour comparison happens in CIELAB with lightness
down-weighted — except when both colours are achromatic, where lightness is the
only thing separating a white jersey from a black one. Applying one weighting
everywhere turns every night game into "black team vs black team".

## Verification

| Component | Tests              | How they were run                                 |
| --------- | ------------------ | ------------------------------------------------- |
| Engine    | 269                | `pnpm --filter @hl-bos/highlight-football test`   |
| App       | 38                 | `pnpm --filter @hl-bos/highlightai-football test` |
| Database  | 975 total (66 new) | pgTAP from empty against PostgreSQL 16.13         |
| Worker    | 77                 | `python3 -m unittest discover -s tests -t .`      |

The seven fixtures in `packages/highlight-football/src/mock/fixtures.ts` are
asserted end to end: on every one, segmentation finds every play and invents
none, and identity resolution claims exactly the athlete's tracks and no
teammate's or opponent's.

## What is NOT done

- **No computer-vision model is installed or trained.** The real adapters raise
  `ModelUnavailableError`. The demo adapters generate synthetic football.
- **No real game film has been processed.** The end-to-end claim above is against
  generated geometry, not against a camera.
- **Migration 0048 has not been applied to any Supabase project.**
- **Nothing is deployed.** No GPU host, no storage bucket, no queue.
- **Phase 2 items** — ball tracking beyond detection, possession estimation,
  automatic statistics, season reels across many games, recruiting profiles — are
  designed for in the schema and not built.
