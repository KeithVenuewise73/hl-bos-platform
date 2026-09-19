"""The adapter contracts (brief section 33).

These are the Python half of the same nine interfaces the TypeScript engine
declares. The names match on both sides on purpose: a reviewer reading
``adapters.ts`` and ``base.py`` should be able to see immediately that they
describe the same seams.

``AdapterInfo.kind`` is the important field. ``"demo"`` output is synthetic and
must be labelled as such everywhere it is stored or shown. It is not a debug
flag, and there is no code path that strips it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Literal, Sequence

from ..types import BallDetection, FrameSignal, JerseyReading, PlayerDetection, Track

Kind = Literal["real", "demo"]


@dataclass(frozen=True)
class AdapterInfo:
    name: str
    version: str
    #: "demo" output is synthetic and MUST be labelled wherever it is shown.
    kind: Kind
    notes: str = ""


@dataclass(frozen=True)
class Frame:
    """A decoded frame. ``pixels`` is opaque: the adapters own its type so that
    importing this module never requires numpy."""

    frame: int
    seconds: float
    width: int
    height: int
    pixels: Any = None


class Adapter(ABC):
    @property
    @abstractmethod
    def info(self) -> AdapterInfo: ...


class PlayerDetector(Adapter):
    @abstractmethod
    def detect(self, frame: Frame) -> list[PlayerDetection]: ...


class TeamClassifier(Adapter):
    @abstractmethod
    def fit(self, samples: Sequence[tuple[int, int, int]]) -> list[tuple[str, tuple[int, int, int], float]]:
        """Learn the two teams' dominant colours from sampled jersey pixels."""

    @abstractmethod
    def classify(self, detection: PlayerDetection) -> tuple[str | None, float]:
        """Returning ``(None, c)`` is a legitimate answer, not a failure."""


class JerseyNumberRecognizer(Adapter):
    @abstractmethod
    def read(self, frame: Frame, detection: PlayerDetection) -> JerseyReading:
        """Returns ``number=None`` when unreadable. Never a guess."""


class PlayerTracker(Adapter):
    @abstractmethod
    def update(self, frame: Frame, detections: Sequence[PlayerDetection]) -> list[Track]: ...

    @abstractmethod
    def flush(self) -> list[Track]: ...


class PlayerReIdentifier(Adapter):
    @abstractmethod
    def embed(self, frame: Frame, detection: PlayerDetection) -> tuple[float, ...] | None: ...


class BallDetectorAdapter(Adapter):
    @abstractmethod
    def detect(self, frame: Frame) -> list[BallDetection]: ...


class PlaySegmenter(Adapter):
    @abstractmethod
    def signals(self, frames: Sequence[Frame]) -> list[FrameSignal]:
        """Produce the per-frame motion signal the engine segments on.

        The worker produces the SIGNAL; the engine decides where the plays are.
        Segmentation is football judgement, and it belongs with the rest of the
        judgement where it can be tested without a video file.
        """


class FootballEventClassifier(Adapter):
    @abstractmethod
    def classify(self, tracks: Sequence[Track], ball: Sequence[BallDetection]) -> list[dict[str, object]]: ...


def is_fully_real(adapters: Sequence[Adapter]) -> bool:
    """True only when every adapter is a real model.

    Intentionally all-or-nothing: a run with a real detector and a demo event
    classifier produced partly synthetic football, and the honest label for that
    is "demo".
    """
    return all(a.info.kind == "real" for a in adapters)


def demo_adapter_names(adapters: Sequence[Adapter]) -> list[str]:
    return [a.info.name for a in adapters if a.info.kind == "demo"]
