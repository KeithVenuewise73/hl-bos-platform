# highlight-cv

The HighlightAI Football computer-vision worker. Turns game film into
observations — detections, tracks, jersey readings, team colours, motion signals,
ball positions — and hands them to the football engine.

It does **not** decide what any of it means. That happens in
`@hl-bos/highlight-football`, which is pure TypeScript and testable without a
video card.

## Running the tests

No GPU, no OpenCV, no FFmpeg, no pytest required:

```bash
cd services/highlight-cv
python3 -m unittest discover -s tests -t .
# 139 tests, 25 skipped — OK
```

The 25 that skip are the ones that need a media toolchain or a model. Install
those and they run:

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[media]'                                    # decode + FFmpeg tests
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision
.venv/bin/pip install -e '.[models]'                                   # real detector tests
.venv/bin/python -m unittest discover -s tests -t .
# 139 tests, 0 skipped — OK
```

**Install torch from its own index, on its own line.** Listing it alongside
PyPI packages makes pip backtrack between two indexes for many minutes and then
pull multi-gigabyte CUDA wheels onto a CPU-only machine. On a GPU host, drop the
`/cpu`.

`pyproject.toml` has **no required dependencies**. Importing `highlight_cv`
works on a laptop with nothing installed, which is what keeps the contracts,
the tracker and the orchestration testable anywhere.

## What has actually been run against real pixels

| Stage     | Proven by                                                                          |
| --------- | ---------------------------------------------------------------------------------- |
| Decode    | `test_video.py` — a real H.264 file, true frame indices preserved                  |
| Detection | `test_real_detector.py` — YOLO11n on photographs of real people                    |
| Tracking  | `test_real_detector.py` — real detections held as continuous identities            |
| Colour    | `test_end_to_end.py` — jerseys survive encode → decode → torso sample              |
| Export    | `test_render_integration.py` — real cuts, 9:16 crops, reels, verified with ffprobe |

**Not yet proven on football.** Nothing here has seen a game file. A person
detector finds people; whether it finds a pile of twenty-two players at
sixty yards on a press-box camera is an open question that one real Hudl export
would answer.

## Two bugs that only running it could have found

**The detector returned a necktie as a football player.** Stock COCO weights
know eighty classes and the adapter filtered none of them. On game film that is
the ball, the bench, the water cooler and the cars in the car park, each
becoming a track competing to be somebody's child. Now filtered to the person
class at `predict()` time.

**A missing weights file raised the wrong exception.** With the library
installed and the checkpoint absent — a worker image with an empty model
volume, which is the failure that actually happens — the adapter raised a bare
`FileNotFoundError`. Not merely a poorer message: a different exception type, so
every caller catching `ModelUnavailableError` to report a missing model cleanly
would have surfaced a stack trace instead. Both paths now fail identically.

## A missing model is a loud failure

Real adapters import lazily and raise `ModelUnavailableError`. There is no
`except ImportError: use the mock` anywhere in this package, and adding one would
be a regression rather than a convenience.

The fallback would not crash and would not log anything alarming. It would
produce a complete, plausible, professionally-rendered highlight reel of plays
that never happened, attached to a real child's name, and nobody would catch it.

## Layout

```
highlight_cv/
  types.py            dataclasses mirroring the TypeScript object model
  color.py            LAB/HSV uniform matching (duplicated for speed, drift-guarded)
  vote.py             temporal jersey-number voting
  motion.py           camera-motion compensation from detection boxes alone
  pipeline.py         17 stages, honest progress, no synthetic creep
  render.py           FFmpeg argument lists — pure, so exports are testable
  worker.py           run_analysis(); Celery is one optional wrapper
  adapters/
    base.py           the nine contracts from brief section 33
    mock.py           synthetic football that runs anywhere (kind="demo")
    real.py           YOLO / ByteTrack / PaddleOCR (kind="real")
```

## Deployment

This service runs on a GPU-capable container host, **not** on Vercel and never
inside a serverless function. The web app deploys separately and talks to it
through the database and the job queue.
