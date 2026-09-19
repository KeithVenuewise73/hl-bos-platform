"""Model adapters.

Every model sits behind one of the abstract bases in ``base.py``, so swapping a
detector is a new adapter and a config change rather than a rewrite of the
pipeline. Object detection and tracking move fast; a codebase that imports one
of them directly has to be rewritten to try another.

Two families ship:

* ``mock`` — deterministic synthetic football. Runs anywhere, with no GPU, and
  is what makes frontend and pipeline development possible while the models are
  being improved. Declares ``kind == "demo"``.
* ``yolo`` / ``bytetrack`` / ``paddle_ocr`` — the real models. They import their
  dependencies lazily and raise ``ModelUnavailableError`` when those are absent.
  They NEVER fall back to the mocks.
"""

from .base import (
    AdapterInfo,
    BallDetectorAdapter,
    FootballEventClassifier,
    JerseyNumberRecognizer,
    PlayerDetector,
    PlayerReIdentifier,
    PlayerTracker,
    PlaySegmenter,
    TeamClassifier,
)

__all__ = [
    "AdapterInfo",
    "BallDetectorAdapter",
    "FootballEventClassifier",
    "JerseyNumberRecognizer",
    "PlayerDetector",
    "PlayerReIdentifier",
    "PlayerTracker",
    "PlaySegmenter",
    "TeamClassifier",
]
