"""Temporal jersey-number voting, mirroring ``jersey.ts``.

The worker votes locally so it can attach a voted number to a track before the
track leaves the GPU box — the engine votes again over the full history. Both
use the same rules, and ``tests/test_vote.py`` pins the brief's worked example
(.81, unreadable, .92, unreadable -> still #23) on this side too.

The central rule, restated because it is easy to undo: an unreadable frame
ABSTAINS. It does not vote "unknown" and it does not count against the leader.
A player with his back turned for forty frames is not forty frames of doubt.
"""

from __future__ import annotations

import math

from .types import JerseyReading

HALF_LIFE_SECONDS = 6.0
MIN_OBSERVATION_CONFIDENCE = 0.35
#: 0.6, not 0.5. A bare majority between two candidates is a coin landing, and
#: the first version of the TypeScript engine returned "definitely #28" on a
#: 50.5/49.5 split until a test caught it.
MIN_SHARE = 0.6
MIN_SUPPORT = 0.6
SURFACE_WEIGHTS = {"back": 1.0, "front": 0.9, "shoulder": 0.6}


class JerseyVote:
    __slots__ = ("number", "confidence", "distribution", "supporting_frames", "abstaining_frames")

    def __init__(
        self,
        number: int | None,
        confidence: float,
        distribution: list[tuple[int, float]],
        supporting_frames: int,
        abstaining_frames: int,
    ) -> None:
        self.number = number
        self.confidence = confidence
        self.distribution = distribution
        self.supporting_frames = supporting_frames
        self.abstaining_frames = abstaining_frames

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return (
            f"JerseyVote(number={self.number}, confidence={self.confidence:.3f}, "
            f"read={self.supporting_frames}/{self.supporting_frames + self.abstaining_frames})"
        )


def temporal_vote(readings: list[JerseyReading], as_of_seconds: float | None = None) -> JerseyVote:
    if not readings:
        return JerseyVote(None, 0.0, [], 0, 0)

    latest = max(r.at.seconds for r in readings)
    as_of = latest if as_of_seconds is None else as_of_seconds
    decay = math.log(2) / HALF_LIFE_SECONDS

    support: dict[int, float] = {}
    supporting = 0
    abstaining = 0

    for r in readings:
        if r.number is None or r.confidence is None or r.confidence < MIN_OBSERVATION_CONFIDENCE:
            abstaining += 1
            continue
        # ABSOLUTE distance, so a vote taken "as of" an earlier moment is not
        # dominated by evidence recorded a minute later.
        age = abs(as_of - r.at.seconds)
        weight = r.confidence * SURFACE_WEIGHTS.get(r.surface, 1.0) * math.exp(-decay * age)
        support[r.number] = support.get(r.number, 0.0) + weight
        supporting += 1

    if not support:
        return JerseyVote(None, 0.0, [], 0, abstaining)

    total = sum(support.values())
    distribution = sorted(((n, w / total) for n, w in support.items()), key=lambda x: -x[1])
    leader_number, leader_share = distribution[0]
    decided = leader_share >= MIN_SHARE and support[leader_number] >= MIN_SUPPORT
    return JerseyVote(
        leader_number if decided else None,
        leader_share,
        distribution,
        supporting,
        abstaining,
    )
