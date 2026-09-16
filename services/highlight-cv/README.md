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
```

77 tests, covering the colour science, the temporal vote, the FFmpeg command
construction, the pipeline's progress arithmetic, the worker end to end with
mock adapters, and a cross-language contract check against the TypeScript engine
and migration 0048.

## Installing the real models

```bash
pip install -e '.[gpu,queue]'
```

`pyproject.toml` has **no** required dependencies. Importing `highlight_cv` works
on a laptop with nothing installed, which is what makes the contracts and the
orchestration testable anywhere.

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
