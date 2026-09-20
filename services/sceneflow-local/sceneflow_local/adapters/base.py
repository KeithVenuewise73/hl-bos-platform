"""The contract every image adapter implements."""

from __future__ import annotations

from typing import Protocol

from ..types import GenerationJob, GenerationOutcome


class ImageAdapter(Protocol):
    """Turns a job into a picture, or fails saying why."""

    @property
    def kind(self) -> str:
        """'real' or 'mock'. Never anything else, and never a lie."""
        ...

    def describe(self) -> str:
        """What this adapter is, for the console to show."""
        ...

    def generate(self, job: GenerationJob) -> GenerationOutcome:
        ...
