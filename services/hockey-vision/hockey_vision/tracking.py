"""Multi-object tracking.

A ByteTrack-style associator: detections are matched to existing tracks in two
passes, high-confidence first, then low-confidence against whatever is left.
That two-pass structure is the whole idea behind ByteTrack and it is why this
module keeps a player through an occlusion. A single-pass matcher throws away
every low-confidence box, so a player who is briefly screened by an opponent
gets a new track id when they reappear — and a new id means the highlight
engine sees two strangers instead of one skater.

Pure Python and pure geometry: no model, no framework, no GPU. That is
deliberate. Association is the part of the pipeline most likely to be wrong in
a way nobody notices, so it is the part that most needs to be testable without
a 200MB download.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence


@dataclass(frozen=True)
class Box:
    """A detection box in pixels, top-left origin."""

    x: float
    y: float
    width: float
    height: float

    @property
    def area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)

    @property
    def centre(self) -> tuple[float, float]:
        return (self.x + self.width / 2.0, self.y + self.height / 2.0)

    def as_dict(self) -> dict[str, float]:
        return {
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "width": round(self.width, 2),
            "height": round(self.height, 2),
        }


def iou(a: Box, b: Box) -> float:
    """Intersection over union. Zero when the boxes do not overlap at all."""
    left = max(a.x, b.x)
    top = max(a.y, b.y)
    right = min(a.x + a.width, b.x + b.width)
    bottom = min(a.y + a.height, b.y + b.height)
    if right <= left or bottom <= top:
        return 0.0
    overlap = (right - left) * (bottom - top)
    union = a.area + b.area - overlap
    if union <= 0:
        return 0.0
    return overlap / union


def association_score(predicted: Box, candidate: Box, reach: float = 1.5) -> float:
    """How much two boxes look like the same player.

    IoU alone is not enough here, and that is a consequence of sampling rather
    than a shortcut. Trackers that rely on pure IoU association assume
    detections on EVERY frame, where a player moves a few pixels between them.
    This pipeline analyses about 5 frames a second to keep a 90-minute game
    affordable, so a skater at speed moves several hundred pixels between
    analysed frames — far more than the ~40px width of their own box. Their
    consecutive boxes do not overlap at all, IoU is 0, and the tracker issues a
    new id on every single frame. The tracker's own tests caught this by asking
    it to follow a fast skater and getting back no tracks whatsoever.

    So: overlap when there is overlap, and proximity when there is not.
    Proximity is scaled by the box's own diagonal, which makes it
    resolution-independent, and capped at 0.5 so that any genuine overlap
    always outranks any mere nearness.

    `reach` is how many box-diagonals of movement are still plausible, and the
    caller varies it by how much it actually knows — see `ByteTracker._reach`.
    """
    overlap = iou(predicted, candidate)
    if overlap > 0:
        return overlap
    px, py = predicted.centre
    cx, cy = candidate.centre
    distance = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
    diagonal = (predicted.width**2 + predicted.height**2) ** 0.5
    if diagonal <= 0:
        return 0.0
    proximity = 1.0 - distance / (diagonal * reach)
    if proximity <= 0:
        return 0.0
    # Halved on purpose: "near" is weaker evidence than "overlapping", and a
    # nearby stranger must never outrank an overlapping continuation.
    return proximity * 0.5


@dataclass(frozen=True)
class Detection:
    """One box the detector produced in one frame."""

    box: Box
    score: float


@dataclass
class TrackObservation:
    frame: int
    time_seconds: float
    box: Box
    detection_score: float
    jersey_color_id: str | None = None
    jersey_color_score: float = 0.0
    jersey_number: str | None = None
    jersey_number_score: float = 0.0


@dataclass
class Track:
    id: int
    observations: list[TrackObservation] = field(default_factory=list)
    #: Frames since this track was last matched. Drives expiry.
    missed: int = 0

    @property
    def last_box(self) -> Box:
        return self.observations[-1].box

    @property
    def velocity(self) -> tuple[float, float]:
        """Per-frame drift from the last two observations.

        Used to predict where a player will be after an occlusion. Without it,
        a skater at speed reappears far from their last box and IoU matching
        fails exactly when the player is most worth tracking.
        """
        if len(self.observations) < 2:
            return (0.0, 0.0)
        previous, current = self.observations[-2], self.observations[-1]
        span = max(1, current.frame - previous.frame)
        px, py = previous.box.centre
        cx, cy = current.box.centre
        return ((cx - px) / span, (cy - py) / span)

    def predict(self, frame: int) -> Box:
        """Where this track is expected to be at `frame`."""
        last = self.observations[-1]
        vx, vy = self.velocity
        elapsed = max(0, frame - last.frame)
        return Box(
            last.box.x + vx * elapsed,
            last.box.y + vy * elapsed,
            last.box.width,
            last.box.height,
        )


def _greedy_match(
    tracks: Sequence[Track],
    detections: Sequence[Detection],
    frame: int,
    threshold: float,
) -> list[tuple[int, int, float]]:
    """Match tracks to detections, best overlap first.

    Greedy rather than Hungarian on purpose. With the handful of candidates a
    single frame produces, greedy assignment gives the same answer as optimal
    assignment often enough that the difference is invisible, and it is short
    enough to read in one sitting — which matters more for the part of the
    pipeline whose bugs are silent.
    """
    scored: list[tuple[float, int, int]] = []
    for ti, track in enumerate(tracks):
        predicted = track.predict(frame)
        reach = (
            ByteTracker.SETTLED_REACH
            if len(track.observations) >= 2
            else ByteTracker.NEW_TRACK_REACH
        )
        for di, detection in enumerate(detections):
            score = association_score(predicted, detection.box, reach)
            if score >= threshold:
                scored.append((score, ti, di))
    scored.sort(reverse=True)

    used_tracks: set[int] = set()
    used_detections: set[int] = set()
    matches: list[tuple[int, int, float]] = []
    for overlap, ti, di in scored:
        if ti in used_tracks or di in used_detections:
            continue
        used_tracks.add(ti)
        used_detections.add(di)
        matches.append((ti, di, overlap))
    return matches


class ByteTracker:
    """Associate detections into tracks, frame by frame.

    Args:
        high_threshold: score above which a detection is trusted on its own.
        low_threshold: score below which a detection is discarded entirely.
        match_threshold: minimum IoU to call a detection the same player.
        max_missed: how many analysed frames a track survives unmatched. Set
            from the frame stride by the caller, so "about two seconds" means
            the same thing whatever rate the video was sampled at.
        min_length: tracks shorter than this are dropped as noise.
    """

    #: How far a track with a known velocity may be from its prediction, in box
    #: diagonals. Tight, because the prediction should already be close.
    SETTLED_REACH = 1.5

    #: How far a track with no velocity estimate yet may be from its last known
    #: position. Wider, because on its second frame we genuinely do not know
    #: which way the player is going — the same reason a Kalman filter starts
    #: with high uncertainty and narrows as it observes motion. Keeping this
    #: wide for settled tracks too would be the wrong trade: it is how a
    #: tracker in a crowded slot swaps two players, which puts another child in
    #: somebody's highlight reel.
    NEW_TRACK_REACH = 4.0

    def __init__(
        self,
        high_threshold: float = 0.55,
        low_threshold: float = 0.15,
        match_threshold: float = 0.2,
        max_missed: int = 10,
        min_length: int = 3,
    ) -> None:
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.match_threshold = match_threshold
        self.max_missed = max_missed
        self.min_length = min_length
        self._active: list[Track] = []
        self._finished: list[Track] = []
        self._next_id = 1

    def update(
        self, frame: int, time_seconds: float, detections: Iterable[Detection]
    ) -> None:
        """Feed one frame's detections in."""
        kept = [d for d in detections if d.score >= self.low_threshold]
        high = [d for d in kept if d.score >= self.high_threshold]
        low = [d for d in kept if d.score < self.high_threshold]

        unmatched_tracks = list(range(len(self._active)))

        # --- Pass one: confident detections ---------------------------------
        matches = _greedy_match(self._active, high, frame, self.match_threshold)
        matched_high: set[int] = set()
        for ti, di, _ in matches:
            self._append(self._active[ti], frame, time_seconds, high[di])
            unmatched_tracks.remove(ti)
            matched_high.add(di)

        # --- Pass two: the leftovers ----------------------------------------
        # This is the pass that carries a player through a screen. A box the
        # detector was only 30% sure of is poor evidence that a NEW player
        # exists, and good evidence that a player we were already following is
        # still there.
        remaining_tracks = [self._active[i] for i in unmatched_tracks]
        low_matches = _greedy_match(remaining_tracks, low, frame, self.match_threshold)
        matched_low: set[int] = set()
        still_unmatched = list(unmatched_tracks)
        for ti, di, _ in low_matches:
            track = remaining_tracks[ti]
            self._append(track, frame, time_seconds, low[di])
            still_unmatched.remove(unmatched_tracks[ti])
            matched_low.add(di)

        for index in still_unmatched:
            self._active[index].missed += 1

        # --- New tracks ------------------------------------------------------
        # Only confident, unmatched detections start a track. Starting one from
        # a low-confidence box fills the output with one-frame ghosts.
        for di, detection in enumerate(high):
            if di in matched_high:
                continue
            track = Track(id=self._next_id)
            self._next_id += 1
            self._append(track, frame, time_seconds, detection)
            self._active.append(track)

        self._expire()

    def _append(
        self, track: Track, frame: int, time_seconds: float, detection: Detection
    ) -> None:
        track.observations.append(
            TrackObservation(
                frame=frame,
                time_seconds=time_seconds,
                box=detection.box,
                detection_score=detection.score,
            )
        )
        track.missed = 0

    def _expire(self) -> None:
        keep: list[Track] = []
        for track in self._active:
            if track.missed > self.max_missed:
                self._finished.append(track)
            else:
                keep.append(track)
        self._active = keep

    def finish(self) -> list[Track]:
        """Close the tracker and return every track worth reporting."""
        self._finished.extend(self._active)
        self._active = []
        return [t for t in self._finished if len(t.observations) >= self.min_length]
