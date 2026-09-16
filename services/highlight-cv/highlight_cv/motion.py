"""Motion and camera-compensation signals (brief section 8).

The engine segments plays from a per-frame motion signal with the CAMERA's own
motion subtracted. This module produces that signal.

``estimate_camera_motion`` is the important one and the reason it is here rather
than inline: a sideline operator panning to follow a huddle produces a large
motion signal while nothing is happening, and feeding that in raw makes the
segmenter call the pan a play. Real implementations use optical flow or a
homography per frame pair; the pure-Python function below estimates the same
quantity from the detection boxes alone, which works surprisingly well because a
camera move shifts EVERY box by roughly the same vector while a football play
moves them in different directions.

Pure Python. No numpy, no OpenCV — so it is testable on any machine, and it is a
usable fallback on footage where optical flow is unreliable.
"""

from __future__ import annotations

import math
from typing import Sequence

from .types import FrameSignal, PlayerDetection


def _median(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 == 1 else (s[mid - 1] + s[mid]) / 2


def estimate_camera_motion(
    previous: Sequence[PlayerDetection], current: Sequence[PlayerDetection]
) -> tuple[float, float]:
    """Global camera motion between two frames, as a normalised (dx, dy).

    The MEDIAN displacement, not the mean. A pan moves every box the same way;
    a play moves a handful of boxes hard in different directions. The median is
    what the camera did, and the mean is what the camera did plus whatever the
    running back did — which is precisely the part we must not subtract.
    """
    if not previous or not current:
        return (0.0, 0.0)

    dxs: list[float] = []
    dys: list[float] = []
    for det in current:
        cx, cy = det.box.center
        best = None
        best_d = 0.15  # beyond this, they are not the same person
        for prev in previous:
            px, py = prev.box.center
            d = math.hypot(cx - px, cy - py)
            if d < best_d:
                best_d, best = d, (cx - px, cy - py)
        if best is not None:
            dxs.append(best[0])
            dys.append(best[1])

    if not dxs:
        return (0.0, 0.0)
    return (_median(dxs), _median(dys))


def frame_signal(
    frame: int,
    previous: Sequence[PlayerDetection],
    current: Sequence[PlayerDetection],
    audio: float | None = None,
) -> FrameSignal:
    """Build one frame's signal for the play segmenter.

    ``motion`` is the total player displacement INCLUDING the camera's
    contribution, and ``camera_motion`` is the camera's part. The engine
    subtracts one from the other; both are reported so the admin debug view can
    show why a pan was or was not mistaken for a play.
    """
    cam_dx, cam_dy = estimate_camera_motion(previous, current)
    camera_motion = math.hypot(cam_dx, cam_dy)

    total = 0.0
    matched = 0
    for det in current:
        cx, cy = det.box.center
        best_d = 0.15
        best: tuple[float, float] | None = None
        for prev in previous:
            px, py = prev.box.center
            d = math.hypot(cx - px, cy - py)
            if d < best_d:
                best_d, best = d, (cx - px, cy - py)
        if best is not None:
            total += math.hypot(best[0], best[1])
            matched += 1

    motion = total / matched if matched else 0.0
    dispersion = _dispersion(current)
    return FrameSignal(
        frame=frame,
        motion=motion,
        camera_motion=camera_motion,
        dispersion=dispersion,
        player_count=len(current),
        audio=audio,
    )


def _dispersion(detections: Sequence[PlayerDetection]) -> float | None:
    """How spread out the players are. Collapses in a huddle, expands at the
    snap — which is one of the signals that corroborates a snap."""
    if len(detections) < 2:
        return None
    centers = [d.box.center for d in detections]
    mx = sum(c[0] for c in centers) / len(centers)
    my = sum(c[1] for c in centers) / len(centers)
    return math.sqrt(sum((c[0] - mx) ** 2 + (c[1] - my) ** 2 for c in centers) / len(centers))
