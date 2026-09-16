"""Mock adapters — synthetic football that runs anywhere (brief section 44).

These are not canned answers. They generate football as GEOMETRY — players
moving along routes, a ball travelling, numbers legible from some angles and not
others, occlusion gaps that genuinely break tracks — and then everything
downstream runs for real. The mock replaces the camera, not the reasoning.

Every one declares ``kind="demo"``, and that flag is carried to the database and
to the UI. A demo result that cannot be told apart from a real one is the exact
failure these rules exist to prevent.
"""

from __future__ import annotations

import math
from typing import Sequence

from ..color import COLOR_REFERENCE, assign_team, classify_jersey_color
from ..types import BallDetection, BoundingBox, FrameSignal, JerseyReading, PlayerDetection, Track, VideoTimestamp
from .base import (
    AdapterInfo,
    BallDetectorAdapter,
    Frame,
    JerseyNumberRecognizer,
    PlayerDetector,
    PlayerReIdentifier,
    PlaySegmenter,
    PlayerTracker,
    TeamClassifier,
)


def _rand(seed: int):
    """Deterministic PRNG. Synthetic football that differs between runs makes a
    wrong answer impossible to debug and a regression impossible to write a test
    for."""
    state = seed & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


class MockPlayerDetector(PlayerDetector):
    """Two players on a route: the athlete and one opponent."""

    def __init__(self, target_number: int = 23, readability: float = 0.32, seed: int = 11) -> None:
        self._target_number = target_number
        self._readability = readability
        self._seed = seed

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-player-detector", "0.1.0", "demo", "Synthetic geometry, not a model.")

    def detect(self, frame: Frame) -> list[PlayerDetection]:
        rnd = _rand(self._seed + frame.frame * 7919)
        out: list[PlayerDetection] = []
        for idx, (label, number, jersey, team) in enumerate(
            [
                ("target", self._target_number, COLOR_REFERENCE["blue"], "team_a"),
                ("opponent", 7, COLOR_REFERENCE["white"], "team_b"),
            ]
        ):
            phase = (frame.frame % 150) / 150
            x = 0.2 + 0.5 * phase + idx * 0.12
            y = 0.4 + math.sin(phase * math.pi * 1.4) * 0.05 + idx * 0.12
            read = rnd() < self._readability
            out.append(
                PlayerDetection(
                    detection_id=f"{label}-{frame.frame}",
                    at=VideoTimestamp(frame.frame, frame.seconds),
                    box=BoundingBox(min(x, 0.94), y, 0.055, 0.13),
                    confidence=0.85,
                    team_label=team,
                    team_confidence=0.9,
                    jersey_rgb=jersey,
                    jersey_number=number if read else None,
                    number_confidence=0.82 if read else None,
                    embedding=tuple(0.1 * (idx + 1) + 0.01 * i for i in range(8)),
                )
            )
        return out


class MockTeamClassifier(TeamClassifier):
    """Runs the REAL colour clustering and the REAL team assignment.

    Nothing is stubbed here beyond where the pixels came from — which is the
    point: demo mode exercises the code that ships.
    """

    def __init__(self) -> None:
        self._teams: list[tuple[str, tuple[int, int, int]]] = []

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-team-classifier", "0.1.0", "demo", "Real clustering over synthetic pixels.")

    def fit(self, samples: Sequence[tuple[int, int, int]]) -> list[tuple[str, tuple[int, int, int], float]]:
        if not samples:
            return []
        buckets: dict[str, list[tuple[int, int, int]]] = {}
        for s in samples:
            name, _, _ = classify_jersey_color(s)
            buckets.setdefault(name, []).append(s)
        ranked = sorted(buckets.items(), key=lambda kv: -len(kv[1]))[:2]
        total = sum(len(v) for _, v in ranked) or 1
        self._teams = []
        out: list[tuple[str, tuple[int, int, int], float]] = []
        for i, (_, members) in enumerate(ranked):
            avg = (
                round(sum(m[0] for m in members) / len(members)),
                round(sum(m[1] for m in members) / len(members)),
                round(sum(m[2] for m in members) / len(members)),
            )
            label = "team_a" if i == 0 else "team_b"
            self._teams.append((label, avg))
            out.append((label, avg, len(members) / total))
        return out

    def classify(self, detection: PlayerDetection) -> tuple[str | None, float]:
        if detection.jersey_rgb is None or not self._teams:
            return (None, 0.0)
        return assign_team(detection.jersey_rgb, self._teams)


class MockJerseyRecognizer(JerseyNumberRecognizer):
    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-jersey-ocr", "0.1.0", "demo", "Replays the generated reading, abstentions included.")

    def read(self, frame: Frame, detection: PlayerDetection) -> JerseyReading:
        return JerseyReading(
            at=detection.at,
            number=detection.jersey_number,
            confidence=detection.number_confidence,
            surface="back",
        )


class MockTracker(PlayerTracker):
    """Associates by nearest box, and DROPS a track when nothing matches.

    Dropping is the important behaviour. A mock that maintained an unbroken
    track across an occlusion would hand the engine an answer the real world
    does not, and the re-identification it exists to exercise would never run.
    """

    #: Normalised distance beyond which two boxes are different people.
    MAX_ASSOCIATION_DISTANCE = 0.08

    def __init__(self) -> None:
        self._open: dict[str, Track] = {}
        self._closed: list[Track] = []
        self._counter = 0

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-tracker", "0.1.0", "demo", "Nearest-box association; splits on occlusion.")

    def update(self, frame: Frame, detections: Sequence[PlayerDetection]) -> list[Track]:
        unmatched = list(detections)
        for label, track in list(self._open.items()):
            last = track.detections[-1]
            best = None
            best_d = self.MAX_ASSOCIATION_DISTANCE
            for det in unmatched:
                lx, ly = last.box.center
                dx, dy = det.box.center
                d = math.hypot(dx - lx, dy - ly)
                if d < best_d:
                    best_d, best = d, det
            if best is None:
                self._closed.append(track)
                del self._open[label]
            else:
                track.detections.append(best)
                unmatched.remove(best)

        for det in unmatched:
            self._counter += 1
            label = f"track-{self._counter}"
            self._open[label] = Track(
                track_label=label,
                detections=[det],
                team_label=det.team_label,
                team_confidence=det.team_confidence,
                # A track that begins mid-video is a re-acquisition, and the
                # tracker knows it: lower continuity confidence, honestly.
                tracking_confidence=0.93 if frame.frame == 0 else 0.74,
            )
        return []

    def flush(self) -> list[Track]:
        tracks = self._closed + list(self._open.values())
        self._closed = []
        self._open = {}
        return tracks


class MockReIdentifier(PlayerReIdentifier):
    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-reid", "0.1.0", "demo", "Returns the generated embedding.")

    def embed(self, frame: Frame, detection: PlayerDetection) -> tuple[float, ...] | None:
        return detection.embedding


class MockBallDetector(BallDetectorAdapter):
    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-ball-detector", "0.1.0", "demo", "Low confidence, as a real ball detector produces.")

    def detect(self, frame: Frame) -> list[BallDetection]:
        phase = (frame.frame % 150) / 150
        return [
            BallDetection(
                at=VideoTimestamp(frame.frame, frame.seconds),
                box=BoundingBox(0.22 + 0.5 * phase, 0.42, 0.012, 0.012),
                # Deliberately low. A ball detector that reports 0.95 is lying.
                confidence=0.38,
            )
        ]


class MockPlaySegmenter(PlaySegmenter):
    """Emits the motion signal; it does NOT decide where the plays are.

    Segmentation is football judgement and lives in the engine, where it is
    tested without a video file.
    """

    @property
    def info(self) -> AdapterInfo:
        return AdapterInfo("mock-segmenter", "0.1.0", "demo", "Synthetic motion signal with dead time and bursts.")

    def signals(self, frames: Sequence[Frame]) -> list[FrameSignal]:
        out: list[FrameSignal] = []
        for f in frames:
            cycle = f.frame % 300
            if cycle < 150:
                motion = 0.012
            else:
                t = (cycle - 150) / 150
                envelope = t / 0.08 if t < 0.08 else math.exp(-2.1 * (t - 0.08))
                motion = 0.012 + 0.26 * envelope
            out.append(FrameSignal(frame=f.frame, motion=motion, camera_motion=0.0))
        return out
