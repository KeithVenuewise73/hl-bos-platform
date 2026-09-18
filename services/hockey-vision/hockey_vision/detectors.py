"""Who is doing the looking.

The brief says the product must not be welded to one detection model, so the
pipeline talks to a `Detector` and never to a model. Swapping YOLO for anything
else is a new class in this file.

Three implementations, and the difference between them is the honesty story:

  * `YoloDetector` — the real one. Requires `ultralytics`; if the package or
    the weights are missing it reports itself unavailable and the service says
    so. It never degrades into guessing.
  * `MotionDetector` — a genuine, model-free fallback built on background
    subtraction. It finds moving objects, which on a fixed-camera rink video
    really are the players. It is honest about what it is: it cannot tell a
    player from a referee, and it says so in `describe()` rather than
    presenting itself as player detection.
  * `ScriptedDetector` — replays boxes from a fixture, for tests only.

`available()` returning False is a first-class outcome. A service with no model
must be able to say "I cannot look at this", because the alternative — zero
detections, reported as success — tells a parent their child did nothing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

import numpy as np

from .tracking import Box, Detection


@dataclass(frozen=True)
class Availability:
    ready: bool
    detail: str
    remedy: str | None = None


class Detector(Protocol):
    """Anything that can find players in a frame."""

    @property
    def id(self) -> str:
        """Stable identifier, recorded against every detection produced."""
        ...

    def available(self) -> Availability: ...

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Boxes for this frame. Never raises for an ordinary empty frame."""
        ...


class YoloDetector:
    """Ultralytics YOLO, restricted to the `person` class.

    Loaded lazily: importing ultralytics pulls in torch, which is slow enough
    that doing it at module import would make even `--help` take ten seconds.
    """

    def __init__(self, weights: str = "yolov8n.pt", confidence: float = 0.25) -> None:
        self.weights = weights
        self.confidence = confidence
        self._model = None
        self._load_error: str | None = None

    @property
    def id(self) -> str:
        return f"ultralytics:{self.weights}"

    def _load(self) -> object | None:
        if self._model is not None or self._load_error is not None:
            return self._model
        try:
            from ultralytics import YOLO  # type: ignore[import-not-found]

            self._model = YOLO(self.weights)
        except Exception as error:  # noqa: BLE001 - reported, never swallowed
            self._load_error = str(error)
        return self._model

    def available(self) -> Availability:
        if self._load() is not None:
            return Availability(True, f"YOLO is loaded ({self.weights}).")
        return Availability(
            False,
            "The player-detection model is not installed, so videos cannot be analysed yet.",
            f"pip install ultralytics, and make sure the weights file {self.weights} "
            "can be downloaded or is present on disk.",
        )

    def detect(self, frame: np.ndarray) -> list[Detection]:
        model = self._load()
        if model is None:
            raise DetectorUnavailable(self.available())
        results = model.predict(frame, conf=self.confidence, classes=[0], verbose=False)
        detections: list[Detection] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for xyxy, score in zip(boxes.xyxy.tolist(), boxes.conf.tolist()):
                x1, y1, x2, y2 = xyxy
                detections.append(
                    Detection(Box(x1, y1, x2 - x1, y2 - y1), float(score))
                )
        return detections


class MotionDetector:
    """Model-free detection by background subtraction.

    This is a real algorithm doing real work, not a stub: on a video shot from
    a fixed position — which is what a parent filming from the stands produces —
    the moving foreground is the players. It runs anywhere OpenCV runs, with no
    weights to download.

    What it honestly is NOT: it does not know what a person is. A referee, a
    thrown towel and a passing spectator are all "motion". That limitation is
    reported in `describe()` and travels with every detection it makes, so the
    product never presents its output as verified player detection.
    """

    def __init__(self, min_area_fraction: float = 0.0008, history: int = 120) -> None:
        self.min_area_fraction = min_area_fraction
        self._history = history
        self._subtractor = None

    @property
    def id(self) -> str:
        return "opencv:mog2-motion"

    def describe(self) -> str:
        return (
            "Motion-based detection. It finds things that move against a still "
            "background, which on a fixed camera is the players — but it cannot "
            "tell a player from a referee or anything else that moves."
        )

    def available(self) -> Availability:
        try:
            import cv2  # noqa: F401
        except Exception as error:  # noqa: BLE001
            return Availability(
                False,
                "OpenCV is not installed, so no video can be read.",
                f"pip install opencv-python-headless ({error})",
            )
        return Availability(
            True,
            "Motion-based detection is available. It has no model behind it and "
            "cannot distinguish a player from anyone else on the ice.",
        )

    def detect(self, frame: np.ndarray) -> list[Detection]:
        import cv2

        if self._subtractor is None:
            self._subtractor = cv2.createBackgroundSubtractorMOG2(
                history=self._history, varThreshold=40, detectShadows=False
            )
        mask = self._subtractor.apply(frame)
        # Open then close: the open removes the single-pixel speckle that ice
        # glare produces, the close rejoins a player split in two by a dark
        # jersey stripe.
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

        height, width = frame.shape[:2]
        min_area = self.min_area_fraction * height * width
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        detections: list[Detection] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            # A standing person is taller than they are wide. Rejecting very
            # wide blobs drops the commonest false positive by far: two players
            # whose motion masks merged into one horizontal smear.
            if h <= 0 or w / h > 1.6:
                continue
            # Confidence from how solidly the blob fills its own box. A real
            # player is a fairly solid shape; a smear of glare is not. This is a
            # heuristic and it is reported as one — never as a model's score.
            fill = area / max(1.0, float(w * h))
            detections.append(Detection(Box(x, y, w, h), round(min(0.95, fill), 3)))
        return detections


class ScriptedDetector:
    """Replays boxes from a fixture. Tests only.

    Its id begins with `fixture:` so that anything derived from it is
    identifiable as fixture-derived everywhere it is stored or displayed.
    """

    def __init__(self, frames: Sequence[Sequence[Detection]]) -> None:
        self._frames = list(frames)
        self._index = 0

    @property
    def id(self) -> str:
        return "fixture:scripted"

    def available(self) -> Availability:
        return Availability(True, "Replaying detections from a fixture.")

    def detect(self, frame: np.ndarray) -> list[Detection]:
        if self._index >= len(self._frames):
            return []
        result = list(self._frames[self._index])
        self._index += 1
        return result


class DetectorUnavailable(RuntimeError):
    """Raised when a detector is asked to work and cannot."""

    def __init__(self, availability: Availability) -> None:
        super().__init__(availability.detail)
        self.availability = availability


def select_detector(name: str) -> Detector:
    """Pick a detector by name.

    There is deliberately no "auto" that silently falls back from YOLO to
    motion. Which detector ran changes what the results mean, and a product
    that quietly swaps one for the other is reporting two different things
    under one label.
    """
    if name == "yolo":
        return YoloDetector()
    if name == "motion":
        return MotionDetector()
    raise ValueError(
        f"Unknown detector {name!r}. Use 'yolo' for the model, or 'motion' for "
        "the model-free fallback."
    )
