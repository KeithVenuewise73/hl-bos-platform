"""Reading the number off a jersey.

Jersey-number OCR is the hardest thing in this pipeline and the most valuable,
because the number is the only signal in a hockey game that is actually unique
to one player. Everything else — colour, size, position — is shared with four
team-mates on the ice.

So this module is a provider interface with an honest default. `NullNumberReader`
reads nothing and says so; it is what you get when no OCR engine is installed.
That produces tracks whose `jersey_number` is None, and the identity fuser in
the TypeScript engine handles that correctly: it redistributes weight onto the
colour signal and refuses to reach the `confirmed` band. The product degrades
into "probably your player, check it" rather than into a confident guess.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class NumberRead:
    """What a reader saw. `digits` is None when nothing legible was found."""

    digits: str | None
    confidence: float


class NumberReader(Protocol):
    @property
    def id(self) -> str: ...

    def available(self) -> bool: ...

    def read(self, crop: np.ndarray) -> NumberRead: ...


class NullNumberReader:
    """Reads nothing, and is clear that it read nothing.

    Not a placeholder to be filled in later — it is the correct behaviour when
    no OCR engine is present. Returning a fabricated number here would be the
    single most damaging lie the product could tell: it would push tracks into
    the `confirmed` band on invented evidence, and `confirmed` is the band that
    tells a parent "this is definitely your child".
    """

    @property
    def id(self) -> str:
        return "none"

    def available(self) -> bool:
        return False

    def read(self, crop: np.ndarray) -> NumberRead:
        return NumberRead(None, 0.0)


class TesseractNumberReader:
    """pytesseract restricted to digits.

    Tesseract is not built for numbers on a creased, moving, angled jersey, and
    it will be wrong often. That is survivable because the engine weights each
    read by the confidence reported here, and treats a single-digit difference
    from the expected number as a probable misread rather than as proof of a
    different player. What would NOT be survivable is returning a number with a
    made-up confidence, so an unparseable result returns None.
    """

    def __init__(self, min_confidence: float = 0.35) -> None:
        self.min_confidence = min_confidence
        self._checked = False
        self._ok = False

    @property
    def id(self) -> str:
        return "tesseract:digits"

    def available(self) -> bool:
        if not self._checked:
            self._checked = True
            try:
                import pytesseract  # noqa: F401

                self._ok = True
            except Exception:  # noqa: BLE001
                self._ok = False
        return self._ok

    def read(self, crop: np.ndarray) -> NumberRead:
        if not self.available() or crop.size == 0:
            return NumberRead(None, 0.0)
        try:
            import cv2
            import pytesseract

            grey = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            # Upscale before thresholding: a jersey number in a 540p proxy is a
            # dozen pixels tall, and Tesseract reads nothing at that size.
            grey = cv2.resize(grey, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            _, binary = cv2.threshold(
                grey, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
            )
            data = pytesseract.image_to_data(
                binary,
                config="--psm 7 -c tessedit_char_whitelist=0123456789",
                output_type=pytesseract.Output.DICT,
            )
            best_digits: str | None = None
            best_confidence = 0.0
            for text, confidence in zip(data["text"], data["conf"]):
                digits = "".join(ch for ch in str(text) if ch.isdigit())
                if not digits or len(digits) > 2:
                    continue
                score = float(confidence) / 100.0
                if score > best_confidence:
                    best_digits, best_confidence = digits, score
            if best_digits is None or best_confidence < self.min_confidence:
                return NumberRead(None, 0.0)
            return NumberRead(best_digits, round(best_confidence, 3))
        except Exception:  # noqa: BLE001
            # A reader that throws has read nothing. Saying so is correct;
            # inventing a number to avoid an empty result is not.
            return NumberRead(None, 0.0)


class ScriptedNumberReader:
    """Returns a fixed sequence of reads. Tests only."""

    def __init__(self, reads: list[NumberRead]) -> None:
        self._reads = reads
        self._index = 0

    @property
    def id(self) -> str:
        return "fixture:scripted"

    def available(self) -> bool:
        return True

    def read(self, crop: np.ndarray) -> NumberRead:
        if self._index >= len(self._reads):
            return NumberRead(None, 0.0)
        result = self._reads[self._index]
        self._index += 1
        return result


def number_crop_bounds(
    x: float, y: float, w: float, h: float
) -> tuple[float, float, float, float]:
    """Where on a player box the number usually is.

    The back number sits across the shoulder blades: roughly the top third of
    the torso, inset horizontally. Cropping tight matters — hand Tesseract the
    whole player and it reads the ice, the boards and the socks.
    """
    return (x + w * 0.22, y + h * 0.22, w * 0.56, h * 0.26)


def select_reader(name: str) -> NumberReader:
    if name in ("none", "null"):
        return NullNumberReader()
    if name == "tesseract":
        return TesseractNumberReader()
    raise ValueError(f"Unknown number reader {name!r}. Use 'tesseract' or 'none'.")
