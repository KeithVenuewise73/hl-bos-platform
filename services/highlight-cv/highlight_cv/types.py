"""The worker's data types.

These mirror the TypeScript object model in ``@hl-bos/highlight-football`` field
for field, because they are serialised straight across that boundary. The two
definitions are checked against each other by
``tests/test_contract.py``: a field added on one side and forgotten on the other
is the kind of drift that produces a silently empty column in production.

Plain dataclasses, no numpy. A detection is twelve numbers; wrapping it in an
array type would add a dependency to the one part of this package that has to
import on any machine.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Surface = Literal["back", "front", "shoulder"]


@dataclass(frozen=True)
class VideoTimestamp:
    """A point in a video, as BOTH frame and seconds.

    Both travel together because deriving one from the other at each boundary is
    how off-by-one-frame drift gets into a clip.
    """

    frame: int
    seconds: float


@dataclass(frozen=True)
class BoundingBox:
    """A box in NORMALISED coordinates (0..1 of frame width/height).

    Normalised rather than pixels so a 1280-wide proxy and a 3840-wide master
    speak the same coordinates.
    """

    x: float
    y: float
    w: float
    h: float

    def contains_point(self, px: float, py: float) -> bool:
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h

    @property
    def center(self) -> tuple[float, float]:
        return (self.x + self.w / 2, self.y + self.h / 2)


@dataclass(frozen=True)
class PlayerDetection:
    """One player box in one frame, exactly as the detector produced it."""

    detection_id: str
    at: VideoTimestamp
    box: BoundingBox
    confidence: float
    team_label: str | None = None
    team_confidence: float | None = None
    jersey_rgb: tuple[int, int, int] | None = None
    helmet_rgb: tuple[int, int, int] | None = None
    pants_rgb: tuple[int, int, int] | None = None
    #: ``None`` means unreadable. Never 0 — 0 is a jersey number.
    jersey_number: int | None = None
    number_confidence: float | None = None
    embedding: tuple[float, ...] | None = None


@dataclass(frozen=True)
class JerseyReading:
    """One attempt to read a number. ``number is None`` means unreadable.

    The abstention is recorded rather than dropped, because "readable in 9 of 61
    frames" is information the UI shows and the metrics depend on.
    """

    at: VideoTimestamp
    number: int | None
    confidence: float | None
    surface: Surface = "back"


@dataclass(frozen=True)
class BallDetection:
    at: VideoTimestamp
    box: BoundingBox
    #: Routinely low. The ball is small, brown, and usually behind somebody.
    confidence: float


@dataclass
class Track:
    """A run of detections the tracker believes is one person."""

    track_label: str
    detections: list[PlayerDetection] = field(default_factory=list)
    team_label: str | None = None
    team_confidence: float | None = None
    tracking_confidence: float = 1.0

    @property
    def start_frame(self) -> int:
        return min((d.at.frame for d in self.detections), default=0)

    @property
    def end_frame(self) -> int:
        return max((d.at.frame for d in self.detections), default=0)


@dataclass(frozen=True)
class FrameSignal:
    """Aggregate per-frame signal the play segmenter consumes.

    ``camera_motion`` is subtracted from ``motion`` by the segmenter. A sideline
    operator panning to follow a huddle produces a large motion signal while
    nothing is happening, and without this the pan becomes a play.
    """

    frame: int
    motion: float
    camera_motion: float = 0.0
    dispersion: float | None = None
    player_count: int | None = None
    audio: float | None = None
