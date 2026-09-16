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


class UltralyticsPlayerDetector(PlayerDetector):
    """YOLO-family person detector, filtered to the football field.

    ``weights`` should point at a detector fine-tuned on football film. The COCO
    'person' class alone also finds the referees, the chain gang, the coaches and
    the crowd behind the fence — all of whom will otherwise become tracks
    competing to be somebody's child.
    """

    def __init__(self, weights: str, confidence: float = 0.35, device: str = "cuda") -> None:
        ultralytics = _require("ultralytics", "UltralyticsPlayerDetector", "gpu")
        self._model = ultralytics.YOLO(weights)
        self._confidence = confidence
        self._device = device
        self._weights = weights

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("ultralytics-player-detector", self._weights, "real")

    def detect(self, frame: Frame) -> list[PlayerDetection]:
        results = self._model.predict(
            frame.pixels, conf=self._confidence, device=self._device, verbose=False
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


class ByteTrackPlayerTracker(PlayerTracker):
    """ByteTrack association over the detector's boxes.

    ByteTrack is the default because its low-confidence second association pass
    is exactly what football needs: a player emerging from a pile is a weak
    detection, and a tracker that discards weak detections loses him every time.
    """

    def __init__(self, frame_rate: float, track_buffer: int = 60) -> None:
        self._yolox = _require("yolox.tracker.byte_tracker", "ByteTrackPlayerTracker", "gpu")
        self._tracker = self._yolox.BYTETracker(
            type("Args", (), {"track_thresh": 0.5, "match_thresh": 0.8, "track_buffer": track_buffer, "mot20": False})(),
            frame_rate=frame_rate,
        )
        self._tracks: dict[str, Track] = {}

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("bytetrack", "0.1.0", "real")

    def update(self, frame: Frame, detections: Sequence[PlayerDetection]) -> list[Track]:  # pragma: no cover
        raise ModelUnavailableError("ByteTrackPlayerTracker", "not wired to a live detector in this build")

    def flush(self) -> list[Track]:  # pragma: no cover
        return list(self._tracks.values())


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
        self._model = ultralytics.YOLO(weights)
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
