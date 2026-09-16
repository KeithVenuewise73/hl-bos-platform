"""Cross-language drift guard.

Three things exist in both Python and TypeScript for good reasons — the worker
needs them on the GPU box, the engine needs them at reasoning time, and crossing
the process boundary per detection would cost more than the arithmetic:

  * the athletic colour reference table,
  * the pipeline stage list and its cost weights,
  * the job status vocabulary (which is also a Postgres enum in migration 0048).

Duplication without a guard becomes drift, and drift here is silent: a colour
renamed on one side produces a team classification that never matches, and a
stage renamed produces a progress bar that sticks. So this test reads the
TypeScript source directly and compares.

It is a crude parser on purpose. A proper one would need a dependency; this
needs to run in the same `python3 -m unittest` invocation as everything else,
on a machine with nothing installed.
"""

import pathlib
import re
import unittest

from highlight_cv.color import COLOR_REFERENCE
from highlight_cv.pipeline import STAGE_COST, STAGE_LABELS, Stage

ENGINE = pathlib.Path(__file__).resolve().parents[3] / "packages" / "highlight-football" / "src"


def source(name: str) -> str:
    path = ENGINE / name
    if not path.exists():  # pragma: no cover - the repo layout is fixed
        raise unittest.SkipTest(f"engine source not found at {path}")
    return path.read_text(encoding="utf-8")


class TestColourTable(unittest.TestCase):
    def test_the_same_colour_names_exist_on_both_sides(self):
        ts = source("color.ts")
        block = ts.split("export const COLOR_REFERENCE")[1].split("};")[0]
        names = set(re.findall(r"^\s*(\w+):\s*\{ r:", block, re.M))
        self.assertEqual(names, set(COLOR_REFERENCE))

    def test_the_same_rgb_values_exist_on_both_sides(self):
        ts = source("color.ts")
        block = ts.split("export const COLOR_REFERENCE")[1].split("};")[0]
        for name, r, g, b in re.findall(
            r"^\s*(\w+):\s*\{ r:\s*(\d+), g:\s*(\d+), b:\s*(\d+) \}", block, re.M
        ):
            self.assertEqual(COLOR_REFERENCE[name], (int(r), int(g), int(b)), name)


class TestPipelineContract(unittest.TestCase):
    def test_the_same_stages_in_the_same_order(self):
        ts = source("pipeline.ts")
        block = ts.split("export const PIPELINE_STAGES = [")[1].split("] as const;")[0]
        ts_stages = re.findall(r'"([a-z_]+)"', block)
        self.assertEqual(ts_stages, [s.value for s in Stage])

    def test_the_same_cost_weights(self):
        ts = source("pipeline.ts")
        block = ts.split("const STAGE_COST")[1].split("};")[0]
        ts_costs = {m[0]: int(m[1]) for m in re.findall(r"^\s*(\w+):\s*(\d+),", block, re.M)}
        self.assertEqual(ts_costs, {s.value: c for s, c in STAGE_COST.items()})

    def test_the_same_customer_facing_labels(self):
        ts = source("pipeline.ts")
        block = ts.split("export const STAGE_LABELS")[1].split("};")[0]
        ts_labels = dict(re.findall(r'^\s*(\w+):\s*"([^"]+)"', block, re.M))
        self.assertEqual(ts_labels, {s.value: label for s, label in STAGE_LABELS.items()})


class TestJobStatusContract(unittest.TestCase):
    """The job statuses exist in THREE places: the engine, this worker's
    callers, and ``highlight.job_status`` in migration 0048. The migration is
    the one that cannot be refactored quietly, so it is compared too."""

    MIGRATION = (
        pathlib.Path(__file__).resolve().parents[3]
        / "supabase" / "migrations" / "20260916120000_hlbos_0048_highlightai_football.sql"
    )

    def test_the_engine_and_the_database_agree(self):
        ts = source("pipeline.ts")
        block = ts.split("export const JOB_STATUSES = [")[1].split("] as const;")[0]
        ts_statuses = re.findall(r'"([a-z_]+)"', block)

        if not self.MIGRATION.exists():  # pragma: no cover - the repo layout is fixed
            self.skipTest("migration not found")
        sql = self.MIGRATION.read_text(encoding="utf-8")
        enum_block = sql.split("create type highlight.job_status as enum")[1].split(";")[0]
        sql_statuses = re.findall(r"'([a-z_]+)'", enum_block)

        self.assertEqual(ts_statuses, sql_statuses)

    def test_the_event_kinds_agree(self):
        ts = source("types.ts")
        block = ts.split("export const FOOTBALL_EVENTS = [")[1].split("] as const;")[0]
        ts_events = sorted(re.findall(r'"([a-z_]+)"', block))

        if not self.MIGRATION.exists():  # pragma: no cover
            self.skipTest("migration not found")
        sql = self.MIGRATION.read_text(encoding="utf-8")
        enum_block = sql.split("create type highlight.event_kind as enum")[1].split(";")[0]
        sql_events = sorted(re.findall(r"'([a-z_]+)'", enum_block))

        self.assertEqual(ts_events, sql_events)


if __name__ == "__main__":
    unittest.main()
