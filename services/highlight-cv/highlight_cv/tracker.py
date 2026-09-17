"""Two-stage multi-object tracking, ByteTrack's association without its baggage.

WHY THIS EXISTS RATHER THAN `import yolox`. The first cut of the real tracker
adapter imported ByteTrack from the YOLOX package and raised NotImplementedError
from `update()`. That is a stub wearing the costume of an implementation: the
class existed, the constructor worked, and nothing tracked anything. Worse, it
pulled a large, largely unmaintained detection framework in for one 400-line
algorithm.

So the algorithm is implemented here, in pure Python, with no dependencies —
which also means it is unit-tested on any machine, alongside everything else in
this package, instead of only on the GPU box.

WHAT BYTETRACK ACTUALLY CONTRIBUTES, AND WHY FOOTBALL NEEDS IT.

Most trackers throw away low-confidence detections before association. That is
reasonable for pedestrians and wrong for football. A player emerging from a pile
is occluded, motion-blurred and half out of frame — a weak detection, exactly
the kind that gets discarded — and discarding it drops the track at the moment
the play gets interesting.

ByteTrack's insight is to associate in two passes:

  Pass 1: high-confidence detections against all active tracks.
  Pass 2: the LOW-confidence detections that pass 1 left over, against the
          tracks that pass 1 failed to match.

A weak detection can therefore keep an existing track alive, while never being
allowed to START one — which is the right asymmetry. Starting a track from a
blur invents a player; continuing a track through a blur keeps a real one.

WHAT THIS DELIBERATELY SIMPLIFIES. Reference ByteTrack runs a Kalman filter with
a full covariance matrix. This uses a constant-velocity predictor with a fixed
blend factor instead. That is weaker in principle, and in practice the
difference shows up mainly in how gracefully a track degrades over a long
occlusion — which in this system is handled a level up, by re-identification
against a human-confirmed anchor, where it can be corrected by a person. Said
plainly here so nobody reads "ByteTrack" and assumes the covariance maths is
present.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .types import BoundingBox, PlayerDetection, Track


def iou(a: BoundingBox, b: BoundingBox) -> float:
    """Intersection over union. 0 when the boxes do not overlap."""
    x1 = max(a.x, b.x)
    y1 = max(a.y, b.y)
    x2 = min(a.x + a.w, b.x + b.w)
    y2 = min(a.y + a.h, b.y + b.h)
    iw = x2 - x1
    ih = y2 - y1
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union > 0 else 0.0


class TrackState:
    TENTATIVE = "tentative"
    CONFIRMED = "confirmed"
    LOST = "lost"
    REMOVED = "removed"


@dataclass
class _ActiveTrack:
    label: str
    box: BoundingBox
    detections: list[PlayerDetection] = field(default_factory=list)
    state: str = TrackState.TENTATIVE
    hits: int = 1
    #: Frames since this track last matched a detection. Drives the buffer.
    age_since_update: int = 0
    velocity: tuple[float, float] = (0.0, 0.0)
    #: Lowest confidence of any association that kept this track alive. Reported
    #: rather than averaged: a chain is exactly as trustworthy as its worst join.
    weakest_link: float = 1.0

    def predict(self) -> BoundingBox:
        """Where this track should be next frame if it keeps doing what it was.

        Predicting is not cosmetic. A receiver running a post is SUPPOSED to be
        far from his previous box, and matching against the stale box loses him
        exactly on the plays worth clipping.
        """
        vx, vy = self.velocity
        return BoundingBox(self.box.x + vx, self.box.y + vy, self.box.w, self.box.h)

    def coast(self) -> None:
        """Advance the track through a frame where nothing matched it.

        This is what makes an occlusion survivable, and leaving it out is a
        subtle, expensive bug: without it `predict()` returns one frame of
        motion no matter how long the player has been hidden, so a runner who
        disappears into a pile is compared against where he was a third of a
        second ago and never matches on the way out. The track splits, and the
        split lands in the middle of the play worth clipping.

        Only the position moves. Velocity is held, because a hidden player is
        the one player we have no new information about — and `weakest_link` is
        untouched, because coasting is not evidence.
        """
        self.box = self.predict()

    def update(self, detection: PlayerDetection, blend: float) -> None:
        prev_cx, prev_cy = self.box.center
        new_cx, new_cy = detection.box.center
        measured = (new_cx - prev_cx, new_cy - prev_cy)
        # Blend toward the measured velocity rather than replacing it, so one
        # jittery box does not throw the prediction off for the next frame.
        self.velocity = (
            self.velocity[0] * (1 - blend) + measured[0] * blend,
            self.velocity[1] * (1 - blend) + measured[1] * blend,
        )
        self.box = detection.box
        self.detections.append(detection)
        self.hits += 1
        self.age_since_update = 0
        self.weakest_link = min(self.weakest_link, detection.confidence)


@dataclass
class TrackerConfig:
    """Thresholds, with the reasoning attached.

    These are not tuned against football film yet — nobody has any. They are
    documented starting points, and the first real game we process should move
    them. Saying so is the difference between a default and a measurement.
    """

    #: Above this, a detection may start a new track.
    high_threshold: float = 0.55
    #: Below this, a detection is discarded entirely as noise.
    low_threshold: float = 0.10
    #: Minimum IoU to call a detection and a track the same person.
    match_iou: float = 0.25
    #: Pass 2 is more permissive: the box is weak, so demanding a tight overlap
    #: defeats the point of looking at it at all.
    match_iou_low: float = 0.15
    #: Frames a track survives unmatched before it is closed. At 30fps this is
    #: one second — about as long as a pile lasts.
    track_buffer: int = 30
    #: Matches needed before a track is trusted. Two, not one: a single frame of
    #: a false positive should not become a player.
    confirm_after: int = 3
    #: Velocity blend factor.
    velocity_blend: float = 0.5


class TwoStageTracker:
    """ByteTrack-style association over a stream of per-frame detections.

    Feed frames in order via `update`, then call `finish` for the full track
    list. Greedy assignment by descending IoU rather than the Hungarian
    algorithm: with at most a couple of dozen candidates per frame the optimal
    assignment and the greedy one almost always agree, and greedy keeps this
    file dependency-free and readable.
    """

    def __init__(self, config: TrackerConfig | None = None) -> None:
        self.config = config or TrackerConfig()
        self._active: list[_ActiveTrack] = []
        self._finished: list[_ActiveTrack] = []
        self._counter = 0

    def update(self, detections: list[PlayerDetection]) -> None:
        cfg = self.config
        strong = [d for d in detections if d.confidence >= cfg.high_threshold]
        weak = [
            d for d in detections
            if cfg.low_threshold <= d.confidence < cfg.high_threshold
        ]

        for track in self._active:
            track.age_since_update += 1

        # --- Pass 1: strong detections against every active track ------------
        unmatched_tracks, unmatched_strong = self._associate(
            self._active, strong, cfg.match_iou
        )

        # --- Pass 2: weak detections against what pass 1 could not match -----
        # This is the whole reason for the algorithm. A player coming out of a
        # pile is a weak detection, and this is where he is kept.
        still_unmatched, _ = self._associate(unmatched_tracks, weak, cfg.match_iou_low)

        # --- Coast, then retire what has been unmatched too long --------------
        for track in still_unmatched:
            track.coast()
            if track.age_since_update > cfg.track_buffer:
                track.state = TrackState.REMOVED
                self._finished.append(track)
                self._active.remove(track)
            elif track.state == TrackState.CONFIRMED:
                track.state = TrackState.LOST

        # --- Start new tracks from STRONG detections only ---------------------
        # A weak detection may continue a track but never begin one: starting
        # from a blur invents a player who was never there.
        for detection in unmatched_strong:
            self._counter += 1
            self._active.append(
                _ActiveTrack(
                    label=f"track-{self._counter}",
                    box=detection.box,
                    detections=[detection],
                    weakest_link=detection.confidence,
                )
            )

    def _associate(
        self,
        tracks: list[_ActiveTrack],
        detections: list[PlayerDetection],
        min_iou: float,
    ) -> tuple[list[_ActiveTrack], list[PlayerDetection]]:
        """Greedy IoU assignment. Returns (unmatched tracks, unmatched dets)."""
        pairs: list[tuple[float, _ActiveTrack, PlayerDetection]] = []
        for track in tracks:
            predicted = track.predict()
            # A track that has been coasting is less certain about where it is,
            # so it is allowed a looser match — the pure-Python stand-in for a
            # Kalman filter's covariance growing during an occlusion. Floored so
            # that "uncertain" never becomes "matches anything".
            gate = max(min_iou * (0.85 ** track.age_since_update), min_iou * 0.4)
            for detection in detections:
                overlap = iou(predicted, detection.box)
                if overlap >= gate:
                    pairs.append((overlap, track, detection))
        pairs.sort(key=lambda p: -p[0])

        used_tracks: set[int] = set()
        used_dets: set[int] = set()
        for overlap, track, detection in pairs:
            if id(track) in used_tracks or id(detection) in used_dets:
                continue
            track.update(detection, self.config.velocity_blend)
            if track.hits >= self.config.confirm_after:
                track.state = TrackState.CONFIRMED
            used_tracks.add(id(track))
            used_dets.add(id(detection))

        return (
            [t for t in tracks if id(t) not in used_tracks],
            [d for d in detections if id(d) not in used_dets],
        )

    def finish(self) -> list[Track]:
        """Close every open track and return the confirmed ones.

        Tentative tracks are DROPPED, not returned. A box that appeared for one
        or two frames and was never seen again is a false positive, and letting
        it through would put a phantom player in the debug view and in the
        re-identification candidate pool.
        """
        everything = self._finished + self._active
        self._finished = []
        self._active = []

        out: list[Track] = []
        for track in everything:
            if track.hits < self.config.confirm_after:
                continue
            out.append(
                Track(
                    track_label=track.label,
                    detections=list(track.detections),
                    team_label=None,
                    team_confidence=None,
                    tracking_confidence=track.weakest_link,
                )
            )
        return out

    @property
    def dropped_as_noise(self) -> int:
        """How many tracks never reached confirmation. Surfaced so a detector
        producing a blizzard of false positives is visible rather than silent."""
        return sum(
            1 for t in self._finished + self._active
            if t.hits < self.config.confirm_after
        )
