"""The worker and the console must agree about which model this machine loads.

The console tells the operator "this machine can hold X, and that is what
SceneFlow would load here". If this worker then loads Y, the page is lying —
quietly, and in the one place the product asked to be trusted.

So the tiers are read out of the TypeScript source and compared. Reading the
real file rather than a copied constant is the whole point: a copy drifts
silently, which is the failure this test exists to catch.
"""

from __future__ import annotations

import re
from pathlib import Path

from sceneflow_local.models import MODEL_TIERS

ROUTES_TS = (
    Path(__file__).resolve().parents[3] / "packages" / "sceneflow" / "src" / "routes.ts"
)


def _ts_tiers() -> list[tuple[str, int]]:
    source = ROUTES_TS.read_text(encoding="utf-8")
    block = re.search(
        r"const MODEL_TIERS:[^=]*=\s*\[(.*?)\n\];", source, re.S
    )
    assert block, "MODEL_TIERS not found in routes.ts — did it move?"
    tiers: list[tuple[str, int]] = []
    for entry in re.finditer(
        r'model:\s*"([^"]+)",\s*\n\s*needsMB:\s*([0-9_]+),', block.group(1)
    ):
        tiers.append((entry.group(1), int(entry.group(2).replace("_", ""))))
    return tiers


class TestModelTiersMatch:
    def test_the_typescript_source_is_readable(self):
        assert ROUTES_TS.exists(), f"expected {ROUTES_TS} to exist"
        assert _ts_tiers(), "no tiers parsed — the shape of routes.ts changed"

    def test_same_names_in_the_same_order(self):
        assert [t.name for t in MODEL_TIERS] == [name for name, _ in _ts_tiers()]

    def test_same_memory_thresholds(self):
        assert [t.needs_mb for t in MODEL_TIERS] == [mb for _, mb in _ts_tiers()]

    def test_the_console_and_the_worker_would_choose_the_same_model(self):
        from sceneflow_local.models import choose_model

        ts = _ts_tiers()
        for vram in (6_144, 8_192, 12_288, 16_384, 24_564):
            fitting = [name for name, mb in ts if vram >= mb]
            expected = fitting[-1] if fitting else None
            chosen = choose_model(vram)
            assert (chosen.name if chosen else None) == expected, f"disagree at {vram} MiB"
