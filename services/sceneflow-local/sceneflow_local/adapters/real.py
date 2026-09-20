"""The real adapter: an openly licensed model on this machine.

Dependencies are imported LAZILY, inside the call, and their absence raises
``ModelUnavailableError``. There is no ``except ImportError: use the mock``
anywhere in this file and adding one would be a regression — see errors.py for
why that matters more here than it looks.

NOT YET VERIFIED END TO END. This code has never loaded a real checkpoint: the
machine it was written on has no NVIDIA card, and the weights host is
unreachable from it. What IS verified is every path that does not need a
checkpoint — the job contract, the model choice, and each way this can fail.
The first run on a machine with a card will either work or say precisely what
is missing; it will not quietly produce something else.
"""

from __future__ import annotations

import importlib
from typing import Any

from ..errors import ModelUnavailableError, UnsafeJobError
from ..models import ModelTier, choose_model
from ..types import GenerationJob, GenerationOutcome

ADAPTER = "local image model"


def _require(module: str, extra: str) -> Any:
    try:
        return importlib.import_module(module)
    except ImportError as exc:  # pragma: no cover - requires the extra absent
        raise ModelUnavailableError(
            ADAPTER, f"`{module}` is not installed (install the '{extra}' extra)"
        ) from exc


class LocalImageAdapter:
    """Loads a diffusion model and generates. Real output or a loud failure."""

    def __init__(self, vram_mb: int | None, tier: ModelTier | None = None) -> None:
        chosen = tier if tier is not None else choose_model(vram_mb)
        if chosen is None:
            raise ModelUnavailableError(
                ADAPTER,
                "no model fits this machine's video memory"
                if vram_mb
                else "no NVIDIA card with usable video memory was found",
            )
        self._tier = chosen
        self._pipe: Any = None

    @property
    def kind(self) -> str:
        return "real"

    @property
    def tier(self) -> ModelTier:
        return self._tier

    def describe(self) -> str:
        licence = " (non-commercial licence — private use only)" if self._tier.non_commercial else ""
        return f"{self._tier.name}{licence}"

    def _load(self) -> Any:
        if self._pipe is not None:
            return self._pipe
        torch = _require("torch", "gpu")
        diffusers = _require("diffusers", "models")

        if not torch.cuda.is_available():
            # Not fatal: CPU generation works and is merely slow. Said out loud
            # so a twenty-minute wait is understood rather than mistaken for a
            # hang, which is how people kill a process that was working.
            device = "cpu"
        else:
            device = "cuda"

        try:
            pipe = diffusers.AutoPipelineForText2Image.from_pretrained(
                self._tier.repo,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            )
        except Exception as exc:  # noqa: BLE001 - re-raised as our own type
            # "The library is installed but the weights are not" is a DIFFERENT
            # failure from "the library is missing", and it is the one that
            # actually happens. Callers catch ModelUnavailableError; letting a
            # bare OSError through would escape every one of them.
            raise ModelUnavailableError(
                ADAPTER,
                f"the weights for {self._tier.name} could not be loaded ({type(exc).__name__}). "
                "They download once, on first use, and need disk space and a reachable model host",
            ) from exc

        self._pipe = pipe.to(device)
        return self._pipe

    def generate(self, job: GenerationJob) -> GenerationOutcome:
        if not job.safety_checked:
            raise UnsafeJobError(
                "this job is not stamped as having passed the safety boundary"
            )
        pipe = self._load()
        torch = _require("torch", "gpu")

        generator = None
        if job.seed is not None:
            generator = torch.Generator().manual_seed(job.seed)

        result = pipe(
            prompt=job.prompt,
            width=job.width,
            height=job.height,
            num_inference_steps=job.steps,
            generator=generator,
        )
        image = result.images[0]
        image.save(job.output_path)
        return GenerationOutcome(
            ok=True,
            job_id=job.job_id,
            image_path=job.output_path,
            adapter_kind="real",
            model=self._tier.name,
        )
