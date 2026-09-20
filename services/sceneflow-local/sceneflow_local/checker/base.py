"""What an output check returns, and the one rule that governs all of them.

THE RULE: ONLY A REAL CLASSIFIER MAY SAY "PASSED".

Everything else in this package can reject an image or admit it does not know.
Nothing else can approve one. That asymmetry is the whole design:

  * A crude screen that says "this looks fine" is worthless — it is wrong
    exactly when it matters, on the image it was too simple to understand.
  * A crude screen that says "this looks wrong" is still useful, because it is
    only ever adding a rejection on top of whatever else ran.

So `unverified` is a first-class outcome and the caller treats it as a refusal.
An image nobody could check is not shown. See worker.run_job.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Protocol

CheckStatus = Literal["passed", "rejected", "unverified"]


@dataclass(frozen=True)
class CheckVerdict:
    status: CheckStatus
    """Which checker produced this. Carried so a verdict can never be anonymous."""
    checker: str
    """Machine-readable, e.g. ("exposed_anatomy",). Never shown to a user raw."""
    reasons: tuple[str, ...] = ()
    """Plain English, safe to show. Says what happened, not what the model saw."""
    detail: str = ""

    @property
    def safe_to_show(self) -> bool:
        return self.status == "passed"


@dataclass(frozen=True)
class Pixels:
    """A decoded image, as plain RGB triples.

    Deliberately not a numpy array or a PIL object: the decision logic then has
    no dependency at all and is testable by writing out a few pixels, which is
    how every check in this package is tested.
    """

    width: int
    height: int
    rgb: tuple[tuple[int, int, int], ...] = field(default=())

    def __post_init__(self) -> None:
        if self.width < 0 or self.height < 0:
            raise ValueError("image dimensions cannot be negative")


class OutputChecker(Protocol):
    @property
    def name(self) -> str: ...

    """True only for a checker able to return `passed`. A screen returns False."""

    @property
    def can_approve(self) -> bool: ...

    def check(self, image_path: str) -> CheckVerdict: ...
