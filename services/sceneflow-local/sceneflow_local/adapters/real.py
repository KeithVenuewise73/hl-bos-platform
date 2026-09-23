"""The real adapter: an openly licensed model on this machine.

Dependencies are imported LAZILY, inside the call, and their absence raises
``ModelUnavailableError``. There is no ``except ImportError: use the mock``
anywhere in this file and adding one would be a regression -- see errors.py for
why that matters more here than it looks.

TWO DEVICES, ONE PATH. A card is used when there is one. Otherwise this runs on
the processor, which is the route the operator chose: renting a machine with a
card means his photographs travel to somebody else's computer, and the whole
reason SceneFlow is self-hosted is that they do not. The processor costs
minutes per picture instead of seconds, and it costs facial continuity between
panels. Both are stated rather than discovered.

NO PICTURE HAS EVER COME OUT OF THIS. What has now been done, and what has not:

  RUN FOR REAL, against torch 2.14 and diffusers 0.40 installed from PyPI on a
  machine with no card -- the same shape as the operator's. doctor() reported
  `can_generate: true` on the processor route. A generation was then attempted
  and failed at the weights, exactly as designed: ModelUnavailableError naming
  the model and the cause, no image written, nothing substituted.

  NOT RUN, because the model host is unreachable from this container: the
  generation itself. huggingface.co is refused by the network here, so no
  checkpoint has ever been loaded and no pixels have ever been produced.

What IS covered is every path that does not need a checkpoint, including the
arguments handed to the pipeline -- asserted rather than trusted, because a
turbo model given thirty steps still returns a picture, just a slow one, and
given guidance 7.5 returns mush. Neither raises. The first run on a real
machine will either work or say precisely what is missing; it will not quietly
produce something else.
"""

from __future__ import annotations

import importlib
import time
from typing import Any

from ..errors import ModelUnavailableError, UnsafeJobError
from ..models import ModelTier, Plan, plan_generation
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

    def __init__(
        self,
        vram_mb: int | None = None,
        tier: ModelTier | None = None,
        ram_mb: int | None = None,
    ) -> None:
        plan = Plan(tier) if tier is not None else plan_generation(vram_mb, ram_mb)
        if plan is None:
            raise ModelUnavailableError(ADAPTER, _nothing_fits(vram_mb, ram_mb))
        self._plan = plan
        self._tier = plan.tier
        self._pipe: Any = None

    @property
    def kind(self) -> str:
        return "real"

    @property
    def tier(self) -> ModelTier:
        return self._tier

    @property
    def plan(self) -> Plan:
        return self._plan

    def describe(self) -> str:
        licence = " (non-commercial licence — private use only)" if self._tier.non_commercial else ""
        where = " on the processor" if self._plan.on_processor else ""
        return f"{self._tier.name}{licence}{where}"

    def _load(self) -> Any:
        if self._pipe is not None:
            return self._pipe
        torch = _require("torch", "cpu")
        diffusers = _require("diffusers", "models")

        device = self._plan.device
        if device == "cuda" and not torch.cuda.is_available():
            # The plan was made from what nvidia-smi reported; torch is the
            # thing that will actually run it. Disagreement is not something to
            # paper over by silently using the processor -- the operator was
            # told a card would be used, and a twenty-minute wait he did not
            # agree to is worse than a refusal he can act on.
            raise ModelUnavailableError(
                ADAPTER,
                "a card was detected but this PyTorch cannot use it "
                "(a CPU-only build is installed, or the driver is not visible)",
                remedy="Reinstall PyTorch with CUDA support, or run on the processor instead.",
            )

        try:
            pipe = diffusers.AutoPipelineForText2Image.from_pretrained(
                self._tier.repo,
                # Half precision is a GPU optimisation. On a processor it is
                # slower than full precision, not faster, and on many CPUs it
                # is not implemented at all.
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

        pipe = pipe.to(device)
        if device == "cpu":
            # Trades a little speed for a much lower peak, which is what decides
            # whether a laptop finishes or is killed by the memory manager.
            for enable in ("enable_attention_slicing", "enable_vae_slicing"):
                method = getattr(pipe, enable, None)
                if callable(method):
                    method()
        self._pipe = pipe
        return self._pipe

    def generate(self, job: GenerationJob) -> GenerationOutcome:
        if not job.safety_checked:
            raise UnsafeJobError(
                "this job is not stamped as having passed the safety boundary"
            )
        pipe = self._load()

        # torch is imported here only to build a seeded generator, so it is
        # imported only when there is a seed. Loading the pipeline already
        # required it; asking again unconditionally added a dependency to a
        # line that does not have one.
        generator = None
        if job.seed is not None:
            generator = _require("torch", "cpu").Generator().manual_seed(job.seed)

        width, height = self.output_size(job)
        started = time.monotonic()
        result = pipe(
            prompt=job.prompt,
            width=width,
            height=height,
            # From the TIER, not the job. A turbo model given 30 steps wastes
            # twenty-six of them; given guidance 7.5 it produces mush. These
            # are properties of the model, so they travel with it.
            num_inference_steps=self._tier.steps,
            guidance_scale=self._tier.guidance,
            generator=generator,
        )
        seconds = time.monotonic() - started
        image = result.images[0]
        image.save(job.output_path)
        return GenerationOutcome(
            ok=True,
            job_id=job.job_id,
            image_path=job.output_path,
            adapter_kind="real",
            model=self._tier.name,
            device=self._plan.device,
            # Measured. Nobody here knows how fast his processor is, and an
            # invented number would be an invented operational metric.
            seconds=seconds,
        )

    def output_size(self, job: GenerationJob) -> tuple[int, int]:
        """The size actually asked of the model.

        Clamped to what the model was trained for, keeping the job's shape. A
        512-trained model asked for 1040 pixels does not give a bigger picture;
        it gives a worse one, slowly, with duplicated limbs.
        """
        longest = max(job.width, job.height)
        if longest <= self._tier.native_px:
            return _multiple_of_eight(job.width), _multiple_of_eight(job.height)
        scale = self._tier.native_px / longest
        return (
            _multiple_of_eight(round(job.width * scale)),
            _multiple_of_eight(round(job.height * scale)),
        )


def _multiple_of_eight(value: int) -> int:
    """Diffusion models need dimensions divisible by eight. Never below 8."""
    return max(8, (int(value) // 8) * 8)


def _nothing_fits(vram_mb: int | None, ram_mb: int | None) -> str:
    if vram_mb:
        return (
            f"this card has {vram_mb} MiB of video memory, below what the smallest "
            "model needs, and no usable amount of system memory was reported either"
        )
    if ram_mb:
        return (
            f"there is no usable card, and {ram_mb} MiB of system memory is below "
            "what the smallest processor model needs"
        )
    return "no card with usable video memory was found, and system memory could not be read"
