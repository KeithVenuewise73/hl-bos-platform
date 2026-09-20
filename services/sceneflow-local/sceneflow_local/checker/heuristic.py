"""A crude screen that can only ever REJECT.

It measures how much of the frame is bare skin. That is a weak signal and this
module says so in its own name and in `can_approve`, which is False: it cannot
return `passed`, so no path through it can approve an image.

WHY KEEP SOMETHING THIS CRUDE

Because of what it is for. It is not the check — it is a second opinion that
runs alongside a real classifier and can only add a refusal. A classifier that
wrongly approves an image is the failure that matters here, and a cheap
independent signal is worth having against it.

WHAT IT IS NOT

It is not a nudity detector. A person in a swimsuit on a beach and a person with
no clothes on have similar skin fractions, and this cannot tell them apart. That
is exactly why it may not approve, and why its threshold is set where a
deliberate false positive is cheap: the worst it does alone is refuse to show
something it did not understand.
"""

from __future__ import annotations

from .base import CheckVerdict, Pixels

# Kovac et al.'s uniform-daylight skin rule. Chosen because it is arithmetic
# rather than a model: it can be read, argued with, and tested by hand.
def is_skin(r: int, g: int, b: int) -> bool:
    return (
        r > 95
        and g > 40
        and b > 20
        and (max(r, g, b) - min(r, g, b)) > 15
        and abs(r - g) > 15
        and r > g
        and r > b
    )


def skin_fraction(pixels: Pixels) -> float:
    """Proportion of the frame that reads as bare skin, 0.0 to 1.0."""
    if not pixels.rgb:
        return 0.0
    hits = sum(1 for (r, g, b) in pixels.rgb if is_skin(r, g, b))
    return hits / len(pixels.rgb)


# Above this, the frame is mostly skin. A clothed romantic scene — faces, hands,
# arms, maybe shoulders — does not reach it. Set high on purpose: this runs
# BESIDE a real classifier, so it should only speak when it is fairly sure.
REJECT_ABOVE = 0.55


class SkinFractionScreen:
    """Rejects a frame that is mostly bare skin. Never approves anything."""

    name = "skin fraction screen"

    @property
    def can_approve(self) -> bool:
        return False

    def inspect(self, pixels: Pixels) -> CheckVerdict:
        fraction = skin_fraction(pixels)
        if fraction > REJECT_ABOVE:
            return CheckVerdict(
                status="rejected",
                checker=self.name,
                reasons=("mostly_bare_skin",),
                detail=(
                    "The generated image was discarded: most of the frame read as bare "
                    "skin, which is outside what SceneFlow will show."
                ),
            )
        return CheckVerdict(
            status="unverified",
            checker=self.name,
            reasons=("screen_only",),
            detail=(
                "This screen found nothing obvious, but it cannot approve an image. "
                "A content classifier has to see it before it is shown."
            ),
        )

    def check(self, image_path: str) -> CheckVerdict:
        from .decode import decode_image

        pixels = decode_image(image_path)
        if pixels is None:
            return CheckVerdict(
                status="unverified",
                checker=self.name,
                reasons=("could_not_decode",),
                detail="The generated image could not be read back, so it was not shown.",
            )
        return self.inspect(pixels)
