"""The mock adapter. Produces a labelled placeholder, never a photograph.

It exists so the whole flow can be walked before any model is installed. It is
chosen EXPLICITLY and is never fallen back to: `kind` is 'mock', the file it
writes is named `*.mock.png`, and the image itself carries the word PLACEHOLDER.
Three independent signals, because one of them will eventually be dropped by
somebody refactoring.
"""

from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any

from ..errors import UnsafeJobError
from ..types import GenerationJob, GenerationOutcome


class MockImageAdapter:
    @property
    def kind(self) -> str:
        return "mock"

    def describe(self) -> str:
        return "placeholder images (no model installed)"

    def generate(self, job: GenerationJob) -> GenerationOutcome:
        if not job.safety_checked:
            raise UnsafeJobError(
                "this job is not stamped as having passed the safety boundary"
            )
        target = Path(job.output_path)
        if target.suffix != ".png" or not target.name.endswith(".mock.png"):
            target = target.with_suffix("").with_suffix(".mock.png")
        target.parent.mkdir(parents=True, exist_ok=True)
        self._write(target, job)
        return GenerationOutcome(
            ok=True,
            job_id=job.job_id,
            image_path=str(target),
            adapter_kind="mock",
            model="placeholder",
        )

    def _write(self, target: Path, job: GenerationJob) -> None:
        try:
            pil: Any = importlib.import_module("PIL.Image")
        except ImportError:
            # Pillow absent: still produce the file, as a text placeholder, so
            # the flow completes and nothing downstream has to special-case it.
            target.write_text(
                f"PLACEHOLDER — no image model is installed.\njob: {job.job_id}\n",
                encoding="utf-8",
            )
            return
        draw = importlib.import_module("PIL.ImageDraw")
        image = pil.new("RGB", (job.width, job.height), (24, 27, 33))
        canvas = draw.Draw(image)
        canvas.text((24, 24), "PLACEHOLDER", fill=(210, 153, 34))
        canvas.text((24, 44), "No image model is installed.", fill=(139, 148, 158))
        canvas.text((24, 64), f"job {job.job_id}", fill=(110, 118, 129))
        image.save(target)
