"""The real output classifier.

Looks at the generated image and reports whether intimate anatomy is exposed —
which is precisely the line SceneFlow draws, so the check maps onto the product
rule rather than onto a vague "NSFW score".

NudeNet is the default because it runs on a CPU, is small, and returns named
anatomy classes rather than a single number. It is a default, not a commitment:
swapping it is a new class in this file implementing the same protocol.

NOT VERIFIED AGAINST A REAL MODEL. The machine this was written on cannot reach
the weights host, so no classification has ever run. What IS tested is every
path that does not need the model: the class-to-decision mapping, the refusal
when the library is absent, and that nothing here can approve an image by
accident. The first run on a machine with the library will either work or say
what is missing.
"""

from __future__ import annotations

import importlib
from typing import Any

from ..errors import ModelUnavailableError
from .base import CheckVerdict

CHECKER = "content classifier"

# Classes that mean intimate anatomy is visible. Exactly the product rule: the
# brief allows romantic, clothed scenes and forbids exposed genitals, exposed
# nipples and explicit sexual content.
EXPOSED_CLASSES: frozenset[str] = frozenset(
    {
        "FEMALE_GENITALIA_EXPOSED",
        "MALE_GENITALIA_EXPOSED",
        "FEMALE_BREAST_EXPOSED",
        "ANUS_EXPOSED",
        "BUTTOCKS_EXPOSED",
    }
)

# Deliberately NOT in the list above. A covered class is the product working as
# intended, and treating "a covered breast is present" as a violation would
# reject most of what SceneFlow is for.
COVERED_CLASSES: frozenset[str] = frozenset(
    {
        "FEMALE_BREAST_COVERED",
        "BUTTOCKS_COVERED",
        "FEMALE_GENITALIA_COVERED",
        "BELLY_COVERED",
        "FEET_COVERED",
        "ARMPITS_COVERED",
    }
)

# Below this the detector is guessing. Its own guesses are not grounds to
# destroy somebody's picture.
MIN_CONFIDENCE = 0.5


def decide(detections: list[dict[str, Any]]) -> CheckVerdict:
    """Map raw detections onto the product rule. Pure, so it is testable."""
    exposed = sorted(
        {
            str(d.get("class", ""))
            for d in detections
            if str(d.get("class", "")) in EXPOSED_CLASSES
            and float(d.get("score", 0.0)) >= MIN_CONFIDENCE
        }
    )
    if exposed:
        return CheckVerdict(
            status="rejected",
            checker=CHECKER,
            reasons=tuple(exposed),
            detail=(
                "The generated image was discarded: it showed intimate anatomy "
                "uncovered, which SceneFlow does not produce. Nothing was kept."
            ),
        )
    return CheckVerdict(
        status="passed",
        checker=CHECKER,
        reasons=(),
        detail="",
    )


class ContentClassifier:
    """The only thing in this package permitted to approve an image."""

    name = CHECKER

    @property
    def can_approve(self) -> bool:
        return True

    def __init__(self) -> None:
        self._detector: Any = None

    def _load(self) -> Any:
        if self._detector is not None:
            return self._detector
        try:
            module = importlib.import_module("nudenet")
        except ImportError as exc:  # pragma: no cover - requires the extra absent
            raise ModelUnavailableError(
                CHECKER,
                "`nudenet` is not installed (install the 'checker' extra)",
                remedy=(
                    "SceneFlow will not show a generated image that nothing has "
                    "checked, so nothing is produced until this is installed."
                ),
            ) from exc
        try:
            self._detector = module.NudeDetector()
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            raise ModelUnavailableError(
                CHECKER,
                f"the classifier could not start ({type(exc).__name__}). Its weights "
                "download once, on first use, and need a reachable model host",
                remedy=(
                    "SceneFlow will not show a generated image that nothing has "
                    "checked, so nothing is produced until this works."
                ),
            ) from exc
        return self._detector

    def check(self, image_path: str) -> CheckVerdict:
        detector = self._load()
        return decide(list(detector.detect(image_path)))
