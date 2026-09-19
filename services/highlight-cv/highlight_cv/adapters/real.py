"""Real model adapters.

Each one imports its dependency LAZILY, inside the constructor, and raises
``ModelUnavailableError`` when it is absent. There is no ``except ImportError:
use the mock`` anywhere in this file, and adding one would be a regression.

Why that matters more here than in most code: the fallback would not crash, and
it would not log anything alarming. It would produce a complete, plausible,
professionally-rendered highlight reel of plays that never happened, attached to
a real child's name. Nobody would catch it. So the failure is loud instead.

The specific models below are defaults, not commitments. Swapping YOLO for
RT-DETR, or ByteTrack for BoT-SORT, is a new class in this file implementing the
same base — the pipeline and the football engine do not change.
"""

from __future__ import annotations

from typing import Any, Sequence

from ..errors import ModelUnavailableError
from ..tracker import TrackerConfig, TwoStageTracker
from ..types import BallDetection, BoundingBox, JerseyReading, PlayerDetection, Track, VideoTimestamp
from .base import (
    AdapterInfo,
    BallDetectorAdapter,
    Frame,
    JerseyNumberRecognizer,
    PlayerDetector,
    PlayerTracker,
)


def _require(module: str, adapter: str, extra: str) -> Any:
    try:
        import importlib

        return importlib.import_module(module)
    except ImportError as exc:  # pragma: no cover - requires the GPU extra absent
        raise ModelUnavailableError(
            adapter, f"`{module}` is not installed (install the '{extra}' extra)"
        ) from exc


def _load_weights(loader: Any, weights: str, adapter: str) -> Any:
    """Load a checkpoint, or fail with the error that says what to do.

    "The library is installed but the weights file is not" is a DIFFERENT
    failure from "the library is not installed", and it is the one that actually
    happens: the library is baked into the worker image, the weights are fetched
    or mounted separately, and a bad path or an empty volume is routine.

    Without this the adapter raised a bare `FileNotFoundError: 'football.pt'`.
    That is worse than it looks. It is not just a poorer message — it is a
    different exception type, so every caller catching ModelUnavailableError to
    report a missing model cleanly would miss it and surface a stack trace
    instead. Both paths now fail the same way, and the message still says
    HighlightAI will not substitute demo output.
    """
    try:
        return loader(weights)
    except ModelUnavailableError:
        raise
    except (FileNotFoundError, OSError) as exc:
        raise ModelUnavailableError(
            adapter, f"the weights file `{weights}` could not be loaded ({exc})"
        ) from exc
    except Exception as exc:  # noqa: BLE001 - any load failure is unavailability
        raise ModelUnavailableError(
            adapter, f"the weights file `{weights}` could not be loaded ({type(exc).__name__}: {exc})"
        ) from exc


#: COCO's 'person' class. A stock YOLO knows eighty classes and, left
#: unfiltered, will happily report a necktie as a football player — verified,
#: not theorised: the first run of this adapter against a photograph of two
#: athletes returned three detections, and the third was class 27, 'tie'.
#: On real game film the same gap returns the ball, the bench, the water
#: cooler and the cars in the car park, and every one of them becomes a track
#: competing to be somebody's child.
COCO_PERSON_CLASS = 0


class UltralyticsPlayerDetector(PlayerDetector):
    """YOLO-family person detector.

    ``weights`` may be stock COCO weights or a detector fine-tuned on football
    film. Either way the output is filtered to the person class, because an
    unfiltered detector does not fail loudly — it quietly fills the candidate
    pool with furniture.

    Filtering to 'person' is necessary and NOT sufficient. It still finds the
    referees, the chain gang, the coaches and the crowd behind the fence. Those
    are people, and separating them from players is the job of team-colour
    classification and the field mask, not of this adapter.
    """

    def __init__(
        self,
        weights: str,
        confidence: float = 0.35,
        device: str = "cuda",
        classes: tuple[int, ...] = (COCO_PERSON_CLASS,),
    ) -> None:
        ultralytics = _require("ultralytics", "UltralyticsPlayerDetector", "gpu")
        self._model = _load_weights(ultralytics.YOLO, weights, "UltralyticsPlayerDetector")
        self._confidence = confidence
        self._device = device
        self._weights = weights
        self._classes = classes

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo(
            "ultralytics-player-detector", self._weights, "real",
            f"classes={self._classes}, conf>={self._confidence}",
        )

    def detect(self, frame: Frame) -> list[PlayerDetection]:
        # Filtering at predict() rather than afterwards: the model does it
        # inside non-maximum suppression, so a discarded class cannot suppress
        # a person who overlapped it.
        results = self._model.predict(
            frame.pixels,
            conf=self._confidence,
            device=self._device,
            classes=list(self._classes),
            verbose=False,
        )
        out: list[PlayerDetection] = []
        for i, box in enumerate(getattr(results[0], "boxes", [])):
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            out.append(
                PlayerDetection(
                    detection_id=f"{frame.frame}-{i}",
                    at=VideoTimestamp(frame.frame, frame.seconds),
                    box=BoundingBox(
                        x1 / frame.width,
                        y1 / frame.height,
                        (x2 - x1) / frame.width,
                        (y2 - y1) / frame.height,
                    ),
                    confidence=float(box.conf[0]),
                )
            )
        return out


class TwoStagePlayerTracker(PlayerTracker):
    """Real tracking, using this package's own two-stage association.

    Replaces an earlier adapter that imported ByteTrack from YOLOX and raised
    NotImplementedError from `update()` — a class that constructed fine and
    tracked nothing. The algorithm now lives in ``highlight_cv.tracker``: no
    dependency, unit-tested on any machine, and honest about which parts of
    reference ByteTrack it implements (the two-stage association) and which it
    approximates (constant-velocity coasting instead of a Kalman filter).

    `kind` is "real" because nothing about this output is synthetic: it tracks
    whatever the detector actually found.
    """

    def __init__(self, config: TrackerConfig | None = None) -> None:
        self._tracker = TwoStageTracker(config)

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo(
            "two-stage-tracker", "0.1.0", "real",
            "ByteTrack-style two-stage association; constant-velocity coasting, not a Kalman filter.",
        )

    def update(self, frame: Frame, detections: Sequence[PlayerDetection]) -> list[Track]:
        self._tracker.update(list(detections))
        # Tracks are returned by flush(): a track is not finished until it has
        # either been lost for longer than the buffer or the video has ended,
        # and handing out a half-built one invites a caller to treat it as final.
        return []

    def flush(self) -> list[Track]:
        return self._tracker.finish()

    @property
    def dropped_as_noise(self) -> int:
        return self._tracker.dropped_as_noise


class PaddleJerseyRecognizer(JerseyNumberRecognizer):
    """Jersey-number OCR over the upper-back crop of a detection.

    It ABSTAINS aggressively. ``min_confidence`` defaults high because a wrong
    number is far more expensive than a missing one: the temporal vote recovers
    from ten unreadable frames without effort, and one confident misread of 23
    as 28 can hand the whole reel to a teammate.
    """

    def __init__(self, min_confidence: float = 0.6) -> None:
        paddleocr = _require("paddleocr", "PaddleJerseyRecognizer", "gpu")
        self._ocr = paddleocr.PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        self._min_confidence = min_confidence

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("paddle-jersey-ocr", "0.1.0", "real")

    def read(self, frame: Frame, detection: PlayerDetection) -> JerseyReading:  # pragma: no cover
        raise ModelUnavailableError("PaddleJerseyRecognizer", "not wired to a live frame source in this build")


class YoloBallDetector(BallDetectorAdapter):
    """Football detector.

    ``confidence`` is deliberately low: the ball is roughly twelve pixels across
    on press-box footage and is behind a body most of the time. Raising the
    threshold to make the numbers look respectable simply means never finding it.
    """

    def __init__(self, weights: str, confidence: float = 0.15, device: str = "cuda") -> None:
        ultralytics = _require("ultralytics", "YoloBallDetector", "gpu")
        self._model = _load_weights(ultralytics.YOLO, weights, "YoloBallDetector")
        self._confidence = confidence
        self._device = device
        self._weights = weights

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("yolo-ball-detector", self._weights, "real")

    def detect(self, frame: Frame) -> list[BallDetection]:  # pragma: no cover
        results = self._model.predict(frame.pixels, conf=self._confidence, device=self._device, verbose=False)
        out: list[BallDetection] = []
        for box in getattr(results[0], "boxes", []):
            x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
            out.append(
                BallDetection(
                    at=VideoTimestamp(frame.frame, frame.seconds),
                    box=BoundingBox(
                        x1 / frame.width, y1 / frame.height,
                        (x2 - x1) / frame.width, (y2 - y1) / frame.height,
                    ),
                    confidence=float(box.conf[0]),
                )
            )
        return out
