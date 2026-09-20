"""Turning a file on disk into pixels, lazily.

Separate from the decision logic so that logic needs no image library at all and
is tested by writing out a handful of pixels. Returns None rather than raising:
"could not read it back" is a normal outcome with its own handling, not an
exception for callers to remember.
"""

from __future__ import annotations

import importlib
from typing import Any

from .base import Pixels

# Downscale before measuring. A 1024x1024 frame is a million tuples in Python,
# and the proportion of skin in an image does not change when you shrink it.
SAMPLE_EDGE = 128


def decode_image(path: str) -> Pixels | None:
    try:
        pil: Any = importlib.import_module("PIL.Image")
    except ImportError:
        return None
    try:
        with pil.open(path) as handle:
            image = handle.convert("RGB")
            image.thumbnail((SAMPLE_EDGE, SAMPLE_EDGE))
            return Pixels(
                width=image.width,
                height=image.height,
                rgb=tuple(image.getdata()),
            )
    except Exception:  # noqa: BLE001 - any unreadable file is the same outcome
        return None
