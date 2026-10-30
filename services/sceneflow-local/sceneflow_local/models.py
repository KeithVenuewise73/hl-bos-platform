"""Which model this machine should load, and on what.

Two families, because there are two kinds of machine.

A machine with an NVIDIA card runs the GPU tiers below, which mirror
chooseModel() in packages/sceneflow/src/routes.ts and are asserted against it
by tests/test_contract.py -- a worker that loads a different model from the one
the console named is a quiet lie on the page.

A machine WITHOUT one is not out of luck, it is just slow. That was the
operator's own case: an HP laptop with AMD graphics built into the processor.
The choice put to him was renting a machine with a card by the hour -- which
means his photographs travel to somebody else's computer -- or running on his
own processor, which keeps them where they are. He chose the processor. The CPU
tiers exist because of that decision, and they are honest about what it costs.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelTier:
    name: str
    """Memory needed, in MiB. Video memory for a GPU tier, system RAM for a CPU one."""
    needs_mb: int
    repo: str
    """True for models whose licence forbids commercial use. Private use only."""
    non_commercial: bool
    """Denoising steps. Turbo models do in four what ordinary ones need thirty for,
    which is the entire reason they are the CPU choice."""
    steps: int = 30
    """Classifier-free guidance. Turbo models are trained for 0.0 and produce
    mush at 7.5, so this travels with the tier rather than with the job."""
    guidance: float = 7.0
    """How well it holds ONE face across several scenes: weak | workable | strong.
    This is the product, so it is recorded rather than implied."""
    identity: str = "workable"
    """cuda or cpu."""
    device: str = "cuda"
    """Longest edge it was trained for. Asking for more makes a worse picture slowly."""
    native_px: int = 1024


# GPU. Smallest first. MUST stay in the same order and with the same memory
# thresholds as MODEL_TIERS in packages/sceneflow/src/routes.ts.
MODEL_TIERS: tuple[ModelTier, ...] = (
    ModelTier("SDXL (compressed)", 8_000, "stabilityai/stable-diffusion-xl-base-1.0", False, identity="weak"),
    ModelTier("SDXL + identity adapter", 12_000, "stabilityai/stable-diffusion-xl-base-1.0", False, identity="workable"),
    ModelTier("FLUX.1 [dev]", 16_000, "black-forest-labs/FLUX.1-dev", True, identity="workable"),
    ModelTier("FLUX.1 Kontext [dev]", 24_000, "black-forest-labs/FLUX.1-Kontext-dev", True, identity="strong"),
)


# CPU. Smallest first, and BOTH are turbo models on purpose.
#
# An ordinary model needs ~30 denoising passes; a turbo one needs four. On a
# card that is the difference between four seconds and one. On a processor it
# is the difference between a few minutes and most of an hour, which is the
# difference between a tool and an abandoned tab.
#
# THESE THRESHOLDS ARE THE WEIGHTS PLUS THE MACHINE, NOT THE WEIGHTS ALONE.
# A card tier can measure video memory against the weights, because nothing
# else is living in video memory. System RAM is not like that: the operating
# system is already in it. Full precision on a processor (half precision is a
# card optimisation and is slower here, not faster) means four bytes a
# parameter, so, from published parameter counts:
#
#   SD-Turbo     865M + 340M + 84M params  ~= 4.9 GiB of weights
#   SDXL-Turbo  2567M + 817M + 84M params  ~= 13.2 GiB of weights
#
# Add ~4 GiB for Windows itself and room for activations. SDXL-Turbo wants
# about 19 GiB before it is comfortable; it was listed at 16 GiB, which is the
# exact amount the operator's laptop reports. It would have been SELECTED on
# his machine and then swapped to a halt -- the failure that looks like the
# button doing nothing. Corrected below.
#
# This is arithmetic, not a measurement: huggingface.co is refused by the
# build network so no checkpoint has ever been loaded here. The first real
# load on a real machine is what confirms or corrects it.
#
# Both are marked `identity: weak`, and that is the honest cost of this route.
# SceneFlow's whole premise is the same people across several scenes, and
# neither of these holds a face the way an identity adapter on a card does.
# They will make good pictures; the faces will drift between panels. The page
# says so, because discovering it on panel four would be worse.
CPU_TIERS: tuple[ModelTier, ...] = (
    ModelTier(
        "SD-Turbo (processor)",
        10_000,
        "stabilityai/sd-turbo",
        True,
        steps=4,
        guidance=0.0,
        identity="weak",
        device="cpu",
        native_px=512,
    ),
    ModelTier(
        "SDXL-Turbo (processor)",
        24_000,
        "stabilityai/sdxl-turbo",
        True,
        steps=4,
        guidance=0.0,
        identity="weak",
        device="cpu",
        native_px=512,
    ),
)


@dataclass(frozen=True)
class Plan:
    """What this machine would actually do."""

    tier: ModelTier

    @property
    def device(self) -> str:
        return self.tier.device

    @property
    def on_processor(self) -> bool:
        return self.tier.device == "cpu"


def choose_model(vram_mb: int | None) -> ModelTier | None:
    """The largest GPU tier that fits, or None.

    None rather than a smaller fallback: a card too small for any of these is a
    card that cannot do the job, and saying so beats generating something
    disappointing. Falling back to the PROCESSOR is a different decision, made
    by plan_generation below, because it is a trade the operator should know he
    is making rather than one made quietly on his behalf.
    """
    if vram_mb is None or vram_mb <= 0:
        return None
    fitting = [t for t in MODEL_TIERS if vram_mb >= t.needs_mb]
    return fitting[-1] if fitting else None


def choose_cpu_model(ram_mb: int | None) -> ModelTier | None:
    """The largest CPU tier that fits in system RAM, or None.

    Weights are held in full precision on a processor -- half precision is a
    GPU optimisation and is slower on a CPU, not faster -- so these thresholds
    are the real ones, not the card numbers halved.
    """
    if ram_mb is None or ram_mb <= 0:
        return None
    fitting = [t for t in CPU_TIERS if ram_mb >= t.needs_mb]
    return fitting[-1] if fitting else None


def plan_generation(vram_mb: int | None, ram_mb: int | None) -> Plan | None:
    """The card if there is one, otherwise the processor, otherwise nothing.

    A card always wins when it fits: it is minutes faster per picture and the
    GPU tiers are the ones that can hold a face. The processor is the fallback,
    not the preference.
    """
    card = choose_model(vram_mb)
    if card is not None:
        return Plan(card)
    processor = choose_cpu_model(ram_mb)
    return Plan(processor) if processor is not None else None
