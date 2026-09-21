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
from sceneflow_local.types import GenerationJob, GenerationOutcome
from sceneflow_local.worker import detect_ram_mb, detect_vram_mb, doctor, run_job


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
    def test_a_machine_with_no_card_and_no_memory_fails_loudly(self):
        # "No card" on its own no longer means "cannot generate" -- the
        # processor route exists now. What still fails is a machine with
        # neither, and it has to say which of the two it could not find.
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=None, ram_mb=None)
        message = str(exc.value)
        assert "card" in message
        assert "system memory" in message

    def test_a_card_too_small_fails_loudly(self):
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=4_096)
        assert "video memory" in str(exc.value)

    def test_a_machine_with_too_little_of_both_names_the_memory(self):
        with pytest.raises(ModelUnavailableError) as exc:
            LocalImageAdapter(vram_mb=None, ram_mb=2_048)
        assert "2048" in str(exc.value).replace("_", "")

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


class TestTheProcessorRoute:
    """He has no NVIDIA card. He chose the processor over renting a machine,
    because renting means his photographs travel to somebody else's computer."""

    def test_a_machine_with_no_card_but_enough_memory_runs_on_the_processor(self):
        adapter = LocalImageAdapter(vram_mb=None, ram_mb=16_000)
        assert adapter.plan.on_processor is True
        assert adapter.plan.device == "cpu"
        assert "processor" in adapter.describe()

    def test_a_smaller_machine_gets_the_smaller_model(self):
        assert LocalImageAdapter(vram_mb=None, ram_mb=8_000).tier.name == "SD-Turbo (processor)"
        assert LocalImageAdapter(vram_mb=None, ram_mb=16_000).tier.name == "SDXL-Turbo (processor)"

    def test_a_card_still_wins_when_there_is_one(self):
        # The processor is the fallback, not the preference: a card is minutes
        # faster per picture and its tiers are the ones that hold a face.
        adapter = LocalImageAdapter(vram_mb=24_000, ram_mb=64_000)
        assert adapter.plan.on_processor is False
        assert adapter.tier.name == "FLUX.1 Kontext [dev]"

    def test_the_processor_models_are_turbo_models(self):
        # Four denoising passes instead of thirty. On a card that is seconds;
        # on a processor it is the difference between a tool and an abandoned
        # tab. Guidance 0.0 because that is what they are trained for.
        for ram in (8_000, 16_000):
            tier = LocalImageAdapter(vram_mb=None, ram_mb=ram).tier
            assert tier.steps == 4
            assert tier.guidance == 0.0

    def test_the_processor_models_admit_they_cannot_hold_a_face(self):
        # SceneFlow's premise is the same people across several scenes, and
        # neither of these does that well. Recorded, so the page can say it
        # rather than the operator finding out on panel four.
        for ram in (8_000, 16_000):
            assert LocalImageAdapter(vram_mb=None, ram_mb=ram).tier.identity == "weak"

    def test_it_never_asks_a_512_model_for_a_1040_pixel_picture(self):
        # Not a bigger picture -- a worse one, slowly, with duplicated limbs.
        adapter = LocalImageAdapter(vram_mb=None, ram_mb=16_000)
        width, height = adapter.output_size(GenerationJob.from_dict(job()))
        assert max(width, height) <= 512
        assert width % 8 == 0 and height % 8 == 0

    def test_it_keeps_the_shape_of_the_frame(self):
        adapter = LocalImageAdapter(vram_mb=None, ram_mb=16_000)
        asked = GenerationJob.from_dict(job())
        width, height = adapter.output_size(asked)
        assert abs((width / height) - (asked.width / asked.height)) < 0.02

    def test_a_small_request_is_left_alone(self):
        adapter = LocalImageAdapter(vram_mb=None, ram_mb=16_000)
        small = GenerationJob(
            job_id="j", prompt="p", output_path="/tmp/x.png",
            width=384, height=512, safety_checked=True,
        )
        assert adapter.output_size(small) == (384, 512)


class TestTheOutcomeCarriesWhatHappened:
    def test_it_reports_the_device_and_the_measured_time(self):
        outcome = GenerationOutcome(
            ok=True, job_id="j", image_path="/tmp/x.png",
            adapter_kind="real", model="SD-Turbo (processor)",
            device="cpu", seconds=91.37,
        )
        as_json = outcome.to_dict()
        assert as_json["device"] == "cpu"
        # Measured, never estimated: nobody here knows how fast his processor
        # is, and an invented number would be an invented operational metric.
        assert as_json["seconds"] == 91.4

    def test_a_failure_carries_no_invented_timing(self):
        outcome = GenerationOutcome(ok=False, job_id="j", error_code="model_unavailable")
        assert outcome.to_dict()["seconds"] == 0.0
        assert outcome.to_dict()["device"] == ""


class TestReadingSystemMemory:
    def test_reads_bytes_and_reports_mebibytes(self):
        assert detect_ram_mb(read=lambda: 16 * 1024 * 1024 * 1024) == 16_384

    def test_could_not_tell_is_none_not_zero(self):
        # Kept apart deliberately: "could not read it" sends someone to check
        # their machine, "not enough" sends them to buy memory.
        assert detect_ram_mb(read=lambda: 0) is None
        assert detect_ram_mb(read=lambda: None) is None

    def test_a_platform_that_throws_does_not_take_the_worker_with_it(self):
        def explode() -> int:
            raise OSError("no such sysconf on this platform")

        assert detect_ram_mb(read=explode) is None

    def test_it_reads_this_actual_machine(self):
        # Not a fixture. If this returns nothing on a real computer the
        # detection is wrong, and that is the whole point of the function.
        assert (detect_ram_mb() or 0) > 0


class TestDoctorOnAMachineWithNoCard:
    """His machine: AMD graphics built into the processor, no NVIDIA card."""

    def test_it_plans_the_processor_instead_of_giving_up(self):
        report = doctor(vram_mb=None, ram_mb=16_000)
        assert report["device"] == "cpu"
        assert report["on_processor"] is True
        assert report["would_load"] == "SDXL-Turbo (processor)"

    def test_it_says_the_faces_will_drift(self):
        # The product is the same people across several scenes. This route does
        # not do that well, and the page has to be able to say so.
        assert doctor(vram_mb=None, ram_mb=16_000)["holds_a_face"] == "weak"

    def test_the_only_thing_missing_is_the_libraries(self):
        report = doctor(vram_mb=None, ram_mb=16_000)
        assert report["can_generate"] is False
        assert "libraries are not installed" in report["why_not"]

    def test_a_card_is_still_preferred_when_present(self):
        report = doctor(vram_mb=24_000, ram_mb=64_000)
        assert report["device"] == "cuda"
        assert report["on_processor"] is False

    def test_too_little_of_everything_says_which(self):
        assert "processor model needs" in doctor(vram_mb=None, ram_mb=2_048)["why_not"]
        assert "video memory" in doctor(vram_mb=4_096, ram_mb=1_024)["why_not"]
        assert "no readable system memory" in doctor(vram_mb=None, ram_mb=None)["why_not"]
