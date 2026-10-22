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

from sceneflow_local.models import CPU_TIERS, MODEL_TIERS

ROUTES_TS = (
    Path(__file__).resolve().parents[3] / "packages" / "sceneflow" / "src" / "routes.ts"
)


def _ts_tiers(const: str = "MODEL_TIERS") -> list[tuple[str, int]]:
    source = ROUTES_TS.read_text(encoding="utf-8")
    block = re.search(
        rf"const {const}:[^=]*=\s*\[(.*?)\n\];", source, re.S
    )
    assert block, f"{const} not found in routes.ts — did it move?"
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


class TestCpuTiersMatch:
    """The processor route, under the same rule as the card route.

    He has no NVIDIA card, so this is the path his machine will actually take.
    A page naming one processor model while the worker loads another would be
    the same quiet lie, on the only route he can use.
    """

    def test_the_typescript_has_processor_tiers_at_all(self):
        assert _ts_tiers("CPU_TIERS"), "no CPU tiers parsed — the shape of routes.ts changed"

    def test_same_names_in_the_same_order(self):
        assert [t.name for t in CPU_TIERS] == [name for name, _ in _ts_tiers("CPU_TIERS")]

    def test_same_memory_thresholds(self):
        assert [t.needs_mb for t in CPU_TIERS] == [mb for _, mb in _ts_tiers("CPU_TIERS")]

    def test_the_console_and_the_worker_would_choose_the_same_processor_model(self):
        from sceneflow_local.models import choose_cpu_model

        ts = _ts_tiers("CPU_TIERS")
        for ram in (4_096, 6_144, 8_192, 16_384, 32_768):
            fitting = [name for name, mb in ts if ram >= mb]
            expected = fitting[-1] if fitting else None
            chosen = choose_cpu_model(ram)
            assert (chosen.name if chosen else None) == expected, f"disagree at {ram} MiB"

    def test_the_card_tiers_and_the_processor_tiers_are_different_models(self):
        # If these ever converged, one of the two lists would be pointless and
        # the console would be offering a choice that is not a choice.
        assert not set(t.name for t in CPU_TIERS) & set(t.name for t in MODEL_TIERS)

    def test_both_processor_models_are_marked_non_commercial(self):
        # Stability's turbo models ship under a non-commercial research
        # licence. Private use is exactly what SceneFlow is scoped to, so this
        # is allowed — but it must be recorded, because it stops being allowed
        # the moment there is a paying user.
        assert all(t.non_commercial for t in CPU_TIERS)

    def test_the_typescript_says_non_commercial_where_the_python_does(self):
        source = ROUTES_TS.read_text(encoding="utf-8")
        block = re.search(r"const CPU_TIERS:[^=]*=\s*\[(.*?)\n\];", source, re.S)
        assert block
        notes = re.findall(r'note:\s*"([^"]+)"', block.group(1))
        assert len(notes) == len(CPU_TIERS)
        for note in notes:
            assert "NON-COMMERCIAL" in note
