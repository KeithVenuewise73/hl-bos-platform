"""What this worker does when it cannot do its job.

Every test here runs with NO model stack installed, which is the state that
actually ships first. The paths that need a checkpoint are not tested and are
documented as untested in adapters/real.py rather than covered by a fake that
would prove nothing.
"""

from __future__ import annotations

import json
import pytest

from sceneflow_local import ModelUnavailableError, UnsafeJobError, choose_model
from sceneflow_local.adapters import LocalImageAdapter, MockImageAdapter
from sceneflow_local.types import GenerationJob
from sceneflow_local.worker import detect_vram_mb, doctor, run_job


def job(**overrides):
    base = {
        "job_id": "j1",
        "prompt": "PRESERVE CAST ... REAL-PERSON SAFETY",
        "output_path": "/tmp/sceneflow-test/out.png",
        "safety_checked": True,
    }
    base.update(overrides)
    return base


class TestJobContract:
    def test_rejects_a_job_missing_required_fields(self):
        with pytest.raises(ValueError, match="missing required field"):
            GenerationJob.from_dict({"job_id": "j1"})

    def test_reads_a_complete_job(self):
        parsed = GenerationJob.from_dict(job(seed=7))
        assert parsed.seed == 7
        assert parsed.safety_checked is True

    def test_carries_the_source_photograph_through(self):
        # The console stores the photo and passes its path; the worker must
        # keep it, or every scene would be generated from nothing and the
        # product's whole premise ("continue THIS image") would be silently
        # absent.
        parsed = GenerationJob.from_dict(job(source_image=".sceneflow/uploads/abc.png"))
        assert parsed.source_image == ".sceneflow/uploads/abc.png"

    def test_no_photograph_is_an_empty_string_not_a_crash(self):
        assert GenerationJob.from_dict(job()).source_image == ""

    def test_safety_checked_defaults_to_false(self):
        # Fail closed: a caller that forgets the stamp does not generate.
        raw = job()
        del raw["safety_checked"]
        assert GenerationJob.from_dict(raw).safety_checked is False


class TestSafetyBackstop:
    def test_the_real_adapter_refuses_an_unstamped_job(self):
        adapter = LocalImageAdapter(vram_mb=24_000)
        with pytest.raises(UnsafeJobError):
            adapter.generate(GenerationJob.from_dict(job(safety_checked=False)))

    def test_the_mock_adapter_refuses_one_too(self):
        # The backstop is not weaker just because the output is a placeholder.
        with pytest.raises(UnsafeJobError):
            MockImageAdapter().generate(
                GenerationJob.from_dict(job(safety_checked=False))
            )

    def test_an_unstamped_job_is_reported_not_swallowed(self):
        outcome = run_job(job(safety_checked=False), use_mock=True)
        assert outcome.ok is False
        assert outcome.error_code == "unsafe_job"


class TestNoSilentFallback:
    def test_a_machine_with_no_card_fails_loudly(self):
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=None)
        assert "no NVIDIA card" in str(exc.value)

    def test_a_card_too_small_fails_loudly(self):
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=4_096)
        assert "video memory" in str(exc.value)

    def test_the_failure_says_it_will_not_substitute(self):
        # The sentence that stops the next person adding a convenient fallback.
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=None)
        assert "will not substitute a placeholder" in str(exc.value)

    def test_run_job_reports_the_failure_rather_than_producing_an_image(self):
        outcome = run_job(job(), use_mock=False)
        assert outcome.ok is False
        assert outcome.error_code == "model_unavailable"
        assert outcome.image_path == ""
        assert outcome.adapter_kind == ""


class TestMockIsUnmistakable:
    def test_it_marks_itself_three_separate_ways(self, tmp_path):
        out = tmp_path / "scene.png"
        outcome = MockImageAdapter().generate(
            GenerationJob.from_dict(job(output_path=str(out)))
        )
        assert outcome.adapter_kind == "mock"
        assert outcome.image_path.endswith(".mock.png")
        assert outcome.model == "placeholder"

    def test_it_actually_writes_a_file(self, tmp_path):
        out = tmp_path / "scene.png"
        outcome = MockImageAdapter().generate(
            GenerationJob.from_dict(job(output_path=str(out)))
        )
        from pathlib import Path

        assert Path(outcome.image_path).exists()

    def test_it_is_never_selected_automatically(self):
        # run_job defaults to the real adapter; --mock is explicit.
        assert run_job(job()).error_code == "model_unavailable"


class TestVramDetection:
    def test_reads_the_number_nvidia_smi_prints(self):
        assert detect_vram_mb(run=lambda: "24564\n") == 24_564

    def test_handles_the_csv_form(self):
        assert detect_vram_mb(run=lambda: "NVIDIA GeForce RTX 4090, 24564\n") == 24_564

    def test_unreadable_is_none_not_zero(self):
        # None means "could not tell". Zero would mean "a card with no memory",
        # which is a different and wrong claim.
        assert detect_vram_mb(run=lambda: "") is None
        assert detect_vram_mb(run=lambda: "not a number") is None


class TestDoctor:
    def test_says_plainly_why_it_cannot_generate(self):
        report = doctor(vram_mb=0)
        assert report["can_generate"] is False
        assert report["why_not"]

    def test_names_the_model_it_would_load(self):
        report = doctor(vram_mb=24_564)
        assert report["would_load"] == "FLUX.1 Kontext [dev]"
        assert report["non_commercial"] is True

    def test_reports_the_libraries_as_missing_when_they_are(self):
        report = doctor(vram_mb=24_564)
        assert report["can_generate"] is False
        assert "libraries are not installed" in report["why_not"]

    def test_is_json_serialisable_because_the_console_parses_it(self):
        json.dumps(doctor(vram_mb=16_384))


class TestModelChoice:
    def test_picks_the_largest_that_fits(self):
        assert choose_model(24_564).name == "FLUX.1 Kontext [dev]"
        assert choose_model(16_384).name == "FLUX.1 [dev]"
        assert choose_model(12_288).name == "SDXL + identity adapter"

    def test_returns_nothing_rather_than_something_disappointing(self):
        assert choose_model(6_144) is None
        assert choose_model(None) is None
        assert choose_model(0) is None

    def test_flags_the_non_commercial_tiers(self):
        assert choose_model(24_564).non_commercial is True
        assert choose_model(8_192).non_commercial is False
