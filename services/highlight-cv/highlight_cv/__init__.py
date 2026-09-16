"""HighlightAI Football — computer-vision worker.

This package turns game film into the observations the football engine reasons
about: player detections, tracks, jersey readings, team colours, plays, ball
positions and events. It does not decide what any of it means. That happens in
``@hl-bos/highlight-football``, which is pure TypeScript and testable without a
video card.

The split is deliberate. Computer vision needs a GPU and a large dependency
tree; football judgement needs neither. Keeping them apart means the product's
decisions — is this your child, is this play worth watching, where does the clip
start — are covered by tests that run in under two seconds on any machine.

WHAT THIS PACKAGE PROMISES:

1. Importing it never requires torch, OpenCV or FFmpeg. Those are optional
   extras, imported lazily by the adapters that need them, so the contracts and
   the orchestration are testable anywhere.

2. A missing model is a LOUD failure. ``ModelUnavailableError`` is raised, and
   there is no fallback to the mock adapters. Silently substituting synthetic
   football for a real analysis would produce a highlight reel of invented plays
   that looks exactly like a real one — the single most damaging thing this
   system could do, so the code path does not exist.

3. Nothing writes a confidence it did not compute. Where a model abstains, the
   worker records ``None`` and the database stores NULL.
"""

from .errors import ModelUnavailableError
from .types import (
    BallDetection,
    BoundingBox,
    FrameSignal,
    JerseyReading,
    PlayerDetection,
    Track,
    VideoTimestamp,
)

__all__ = [
    "BallDetection",
    "BoundingBox",
    "FrameSignal",
    "JerseyReading",
    "ModelUnavailableError",
    "PlayerDetection",
    "Track",
    "VideoTimestamp",
]
