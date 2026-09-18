"""Reading a jersey off a crop of a player.

Two jobs, both done on real pixels with numpy:

  * **Colour.** Which of the known jersey colours the torso most resembles.
  * **Number.** Delegated to an OCR provider, because good digit recognition
    needs a model and this module must work without one.

The torso crop is the important detail. A player's bounding box is mostly ice,
helmet, socks and stick; the jersey occupies a band across the upper-middle.
Averaging the whole box gives you the colour of the rink. So the crop is taken
from the middle of the box, horizontally inset to drop the arms and the
background either side of a skating stride.

The colour definitions are duplicated from packages/hockey-highlights/src/jersey.ts
on purpose: the two processes do not share a runtime, and a shared file would
mean a build step between a TypeScript package and a Python service for no gain.
`tests/test_jersey.py` asserts the two lists agree, so the duplication cannot
drift silently.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ColorSpec:
    """A jersey colour, defined the way OpenCV measures hue (0..179)."""

    id: str
    hue_ranges: tuple[tuple[int, int], ...]
    min_saturation: int
    min_value: int
    max_value: int
    achromatic: bool


COLORS: tuple[ColorSpec, ...] = (
    ColorSpec("white", ((0, 179),), 0, 170, 255, True),
    ColorSpec("black", ((0, 179),), 0, 0, 60, True),
    ColorSpec("red", ((0, 8), (170, 179)), 90, 60, 255, False),
    ColorSpec("maroon", ((0, 10), (168, 179)), 80, 30, 130, False),
    ColorSpec("orange", ((9, 20),), 110, 80, 255, False),
    ColorSpec("gold", ((21, 34),), 90, 90, 255, False),
    ColorSpec("green", ((35, 85),), 70, 50, 255, False),
    ColorSpec("teal", ((86, 97),), 70, 50, 255, False),
    ColorSpec("blue", ((98, 125),), 90, 70, 255, False),
    ColorSpec("navy", ((98, 128),), 70, 20, 110, False),
    ColorSpec("purple", ((126, 155),), 70, 50, 255, False),
    ColorSpec("grey", ((0, 179),), 0, 90, 180, True),
)

COLORS_BY_ID = {spec.id: spec for spec in COLORS}


def torso_crop(frame: np.ndarray, x: float, y: float, w: float, h: float) -> np.ndarray:
    """The band of a player box that is actually jersey.

    Vertically 25%-60% of the box: below the helmet, above the pants. And
    horizontally inset by 20% each side, which drops the arms and, more
    importantly, the ice visible between a skater's legs and elbows mid-stride.
    """
    height, width = frame.shape[:2]
    x0 = int(max(0, min(width - 1, x + w * 0.20)))
    x1 = int(max(x0 + 1, min(width, x + w * 0.80)))
    y0 = int(max(0, min(height - 1, y + h * 0.25)))
    y1 = int(max(y0 + 1, min(height, y + h * 0.60)))
    return frame[y0:y1, x0:x1]


def _in_hue_range(hue: np.ndarray, spec: ColorSpec) -> np.ndarray:
    """Mask of pixels inside any of a colour's hue windows.

    The loop over windows is what makes red work. Red straddles the 0/179 seam,
    so a single `low <= h <= high` comparison matches either nothing or almost
    everything.
    """
    mask = np.zeros(hue.shape, dtype=bool)
    for low, high in spec.hue_ranges:
        mask |= (hue >= low) & (hue <= high)
    return mask


def classify_color(hsv_crop: np.ndarray) -> tuple[str | None, float]:
    """Best-matching jersey colour for a crop, and how much of it agreed.

    Takes an HSV crop and returns ``(colour_id, score)`` where score is the
    fraction of pixels matching that colour. Returns ``(None, 0.0)`` when
    nothing matches well — which is a real answer, not a failure. A player at
    the far boards is a handful of grey pixels, and the honest report is "I
    could not read this jersey", not a guess that the identity fuser will then
    treat as evidence.
    """
    if hsv_crop.size == 0:
        return (None, 0.0)

    hue = hsv_crop[:, :, 0].astype(np.int16)
    saturation = hsv_crop[:, :, 1].astype(np.int16)
    value = hsv_crop[:, :, 2].astype(np.int16)
    total = float(hue.size)

    best_id: str | None = None
    best_score = 0.0
    # Tie-break by how specific the winning definition is. Some colours
    # genuinely overlap: navy is "blue, but dark", so its value window (20-110)
    # sits inside blue's (70-255), and a pixel at value 90 satisfies both
    # completely. Without an explicit rule the winner was decided by list
    # order, which silently reported every navy jersey in the product as blue —
    # a team colour the user picked from a menu, contradicted by the analysis.
    # When two definitions match equally well, the narrower one is the better
    # description.
    best_breadth = float("inf")
    for spec in COLORS:
        in_value = (value >= spec.min_value) & (value <= spec.max_value)
        if spec.achromatic:
            # White, black and grey are defined by lightness and by the ABSENCE
            # of colour. Without the saturation ceiling a matcher happily calls
            # a bright red jersey "white" because it is bright.
            mask = in_value & (saturation < 60)
        else:
            mask = in_value & (saturation >= spec.min_saturation) & _in_hue_range(hue, spec)
        score = float(np.count_nonzero(mask)) / total
        breadth = float(spec.max_value - spec.min_value)
        if score > best_score + 1e-9 or (
            abs(score - best_score) <= 1e-9 and score > 0 and breadth < best_breadth
        ):
            best_score = score
            best_id = spec.id
            best_breadth = breadth

    # Below this, the "best" match is a minority of the crop and means nothing.
    if best_score < 0.35:
        return (None, 0.0)
    return (best_id, round(best_score, 3))


def dominant_hsv(hsv_crop: np.ndarray) -> tuple[int, int, int]:
    """Median HSV of a crop. Median, not mean: a mean hue is meaningless.

    Hue is an angle. The mean of 179 and 1 is 90 — a cyan average of two reds.
    The median is at least always a hue that actually occurs in the crop.
    """
    if hsv_crop.size == 0:
        return (0, 0, 0)
    flat = hsv_crop.reshape(-1, 3)
    return tuple(int(v) for v in np.median(flat, axis=0))  # type: ignore[return-value]
