"""Which model this machine should load.

Mirrors chooseModel() in packages/sceneflow/src/routes.ts. The two are asserted
against each other by tests/test_contract.py, because a worker that loads a
different model from the one the console told the operator it would load is a
quiet lie on the page.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelTier:
    name: str
    needs_mb: int
    repo: str
    """True for models whose licence forbids commercial use. Private use only."""
    non_commercial: bool


# Smallest first. Must stay in the same order and with the same memory
# thresholds as MODEL_TIERS in packages/sceneflow/src/routes.ts.
MODEL_TIERS: tuple[ModelTier, ...] = (
    ModelTier("SDXL (compressed)", 8_000, "stabilityai/stable-diffusion-xl-base-1.0", False),
    ModelTier("SDXL + identity adapter", 12_000, "stabilityai/stable-diffusion-xl-base-1.0", False),
    ModelTier("FLUX.1 [dev]", 16_000, "black-forest-labs/FLUX.1-dev", True),
    ModelTier("FLUX.1 Kontext [dev]", 24_000, "black-forest-labs/FLUX.1-Kontext-dev", True),
)


def choose_model(vram_mb: int | None) -> ModelTier | None:
    """The largest tier that fits, or None.

    None rather than a smaller fallback: a model that cannot hold a face across
    two scenes does not make a story, it makes a slideshow of strangers. The
    caller says so plainly instead of generating something disappointing.
    """
    if vram_mb is None or vram_mb <= 0:
        return None
    fitting = [t for t in MODEL_TIERS if vram_mb >= t.needs_mb]
    return fitting[-1] if fitting else None
