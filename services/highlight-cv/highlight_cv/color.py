"""Colour science, mirroring ``@hl-bos/highlight-football``'s ``color.ts``.

WHY IT IS DUPLICATED RATHER THAN CALLED. The worker samples pixels and must
classify a uniform colour at detection time, in Python, on the GPU box. The
engine compares uniform colours at reasoning time, in TypeScript. Crossing the
process boundary per detection would cost more than the arithmetic. So the same
maths exists twice — and ``tests/test_color.py`` pins the outputs against the
values the TypeScript tests assert, so the two cannot drift apart silently.

Pure Python: no numpy. The conversions are a dozen multiplications and this
module has to import on a machine with nothing installed.
"""

from __future__ import annotations

import math

Rgb = tuple[int, int, int]

#: Reference athletic-apparel colours. Same table as ``COLOR_REFERENCE`` in the
#: TypeScript engine, and deliberately NOT web colours: no team wears #FFD700,
#: and matching against it pushes every real gold jersey toward orange.
COLOR_REFERENCE: dict[str, Rgb] = {
    "white": (244, 244, 242),
    "black": (24, 24, 26),
    "navy": (20, 34, 74),
    "blue": (30, 74, 158),
    "royal_blue": (24, 62, 188),
    "columbia_blue": (126, 177, 216),
    "teal": (0, 118, 124),
    "green": (26, 122, 60),
    "forest_green": (20, 72, 42),
    "kelly_green": (28, 158, 74),
    "yellow": (236, 216, 68),
    "gold": (196, 158, 54),
    "orange": (224, 108, 32),
    "red": (190, 36, 40),
    "maroon": (112, 28, 42),
    "crimson": (154, 26, 48),
    "purple": (86, 42, 132),
    "pink": (226, 128, 162),
    "silver": (178, 180, 184),
    "gray": (122, 124, 128),
    "brown": (96, 62, 40),
}

_XN, _YN, _ZN = 95.047, 100.0, 108.883


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def _srgb_to_linear(c: float) -> float:
    """sRGB companding. Not decorative: skipping the gamma curve biases every
    dark uniform toward black in LAB."""
    cn = _clamp(c, 0, 255) / 255
    return cn / 12.92 if cn <= 0.04045 else ((cn + 0.055) / 1.055) ** 2.4


def rgb_to_lab(rgb: Rgb) -> tuple[float, float, float]:
    r = _srgb_to_linear(rgb[0]) * 100
    g = _srgb_to_linear(rgb[1]) * 100
    b = _srgb_to_linear(rgb[2]) * 100

    x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375
    y = r * 0.2126729 + g * 0.7151522 + b * 0.072175
    z = r * 0.0193339 + g * 0.119192 + b * 0.9503041

    def f(t: float) -> float:
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116

    fx, fy, fz = f(x / _XN), f(y / _YN), f(z / _ZN)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def rgb_to_hsv(rgb: Rgb) -> tuple[float, float, float]:
    rn, gn, bn = (_clamp(c, 0, 255) / 255 for c in rgb)
    mx, mn = max(rn, gn, bn), min(rn, gn, bn)
    d = mx - mn
    if d == 0:
        h = 0.0
    elif mx == rn:
        h = 60 * (((gn - bn) / d) % 6)
    elif mx == gn:
        h = 60 * ((bn - rn) / d + 2)
    else:
        h = 60 * ((rn - gn) / d + 4)
    return (h % 360, 0.0 if mx == 0 else d / mx, mx)


def chroma(lab: tuple[float, float, float]) -> float:
    """How colourful, regardless of how light. Drives the switch below."""
    return math.hypot(lab[1], lab[2])


#: Below this LAB chroma a colour is achromatic (white/gray/black family).
ACHROMATIC_CHROMA = 18.0
CHROMATIC_LIGHTNESS_WEIGHT = 0.25
ACHROMATIC_LIGHTNESS_WEIGHT = 1.0


def uniform_distance(a: Rgb, b: Rgb) -> float:
    """Lighting-tolerant distance between two uniform colours.

    Down-weights lightness for a clearly-coloured uniform, because lightness is
    the axis stadium lights move most — and then STOPS down-weighting it once
    both colours are achromatic, because lightness is the only axis separating a
    white jersey from a black one. Applying one weighting everywhere turns every
    night game into "black team vs black team".
    """
    la, lb = rgb_to_lab(a), rgb_to_lab(b)
    ca, cb = chroma(la), chroma(lb)
    both_achromatic = ca < ACHROMATIC_CHROMA and cb < ACHROMATIC_CHROMA

    if not both_achromatic and (ca < ACHROMATIC_CHROMA or cb < ACHROMATIC_CHROMA):
        # One colourful, one not: different uniforms regardless of the light.
        return max(abs(ca - cb), math.hypot(la[1] - lb[1], la[2] - lb[2]))

    lw = ACHROMATIC_LIGHTNESS_WEIGHT if both_achromatic else CHROMATIC_LIGHTNESS_WEIGHT
    return math.hypot((la[0] - lb[0]) * lw, la[1] - lb[1], la[2] - lb[2])


def classify_jersey_color(rgb: Rgb) -> tuple[str, float, list[tuple[str, float]]]:
    """Name an observed uniform colour, with a real distribution.

    Confidence is a softmax over negative distance, so a sample sitting between
    navy and royal blue reports two middling numbers rather than a confident lie.
    """
    scored = [(name, uniform_distance(rgb, ref)) for name, ref in COLOR_REFERENCE.items()]
    best = min(d for _, d in scored)
    temperature = 12.0
    weights = [(name, math.exp(-(d - best) / temperature)) for name, d in scored]
    total = sum(w for _, w in weights)
    dist = sorted(((n, w / total) for n, w in weights), key=lambda x: -x[1])
    return (dist[0][0], dist[0][1], dist)


def assign_team(
    observed: Rgb,
    teams: list[tuple[str, Rgb]],
    min_margin: float = 6.0,
) -> tuple[str | None, float]:
    """Decide which of two teams a sampled jersey belongs to.

    Returns ``(None, confidence)`` — not a coin flip — when the teams are not
    separated enough at this sample for the answer to mean anything. A referee,
    a coach on the sideline and a half-occluded shoulder all land there, and
    "unknown" is the honest output.
    """
    if not teams:
        return (None, 0.0)
    scored = sorted(((tid, uniform_distance(observed, jersey)) for tid, jersey in teams), key=lambda x: x[1])
    best_id, best_d = scored[0]
    if len(scored) == 1:
        return (best_id, _clamp(1 - best_d / 60, 0, 1)) if best_d < 45 else (None, _clamp(1 - best_d / 60, 0, 1))

    _, next_d = scored[1]
    temperature = 12.0
    w_best = math.exp(-best_d / temperature)
    w_next = math.exp(-next_d / temperature)
    confidence = w_best / (w_best + w_next)
    if next_d - best_d < min_margin or best_d > 55:
        return (None, confidence)
    return (best_id, confidence)
