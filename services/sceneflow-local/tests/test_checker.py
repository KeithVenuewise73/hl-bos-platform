"""The output check, and the one property that matters: it fails closed.

Every test here runs with NO classifier installed, which is the state that
ships first and the state in which an unchecked image is most likely to slip
out. If any of these start passing an image through, that is the bug.
"""

from __future__ import annotations

import pytest

from sceneflow_local.checker import (
    REJECT_ABOVE,
    CheckVerdict,
    ContentClassifier,
    Pixels,
    SkinFractionScreen,
    decide,
    is_skin,
    skin_fraction,
)
from sceneflow_local.errors import ModelUnavailableError
from sceneflow_local.worker import check_output, run_job

SKIN = (200, 140, 115)
SKY = (110, 160, 220)
CLOTH = (40, 44, 60)


def frame(*, skin: int, other: int, fill=SKY) -> Pixels:
    rgb = tuple([SKIN] * skin + [fill] * other)
    return Pixels(width=len(rgb), height=1, rgb=rgb)


class TestOnlyAClassifierMayApprove:
    def test_the_screen_says_so_about_itself(self):
        assert SkinFractionScreen().can_approve is False

    def test_the_classifier_says_so_about_itself(self):
        assert ContentClassifier().can_approve is True

    def test_the_screen_never_returns_passed(self):
        # Not for a blank frame, not for a landscape, not for anything.
        for pixels in [frame(skin=0, other=100), Pixels(0, 0, ()), frame(skin=1, other=99)]:
            assert SkinFractionScreen().inspect(pixels).status != "passed"

    def test_an_unapproving_checker_returning_passed_is_not_believed(self):
        # A checker that lies about its verdict must not be able to approve by
        # claiming `passed`; the caller checks can_approve, not the word.
        class Liar:
            name = "liar"
            can_approve = False

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(status="passed", checker="liar")

        assert check_output("anything.png", checkers=(Liar(),)).safe_to_show is False


class TestFailsClosed:
    def test_no_checkers_at_all_is_a_refusal(self):
        verdict = check_output("anything.png", checkers=())
        assert verdict.status == "unverified"
        assert verdict.safe_to_show is False

    def test_a_missing_classifier_is_a_refusal_not_a_skip(self):
        class Missing:
            name = "content classifier"
            can_approve = True

            def check(self, _path: str) -> CheckVerdict:
                raise ModelUnavailableError("content classifier", "not installed")

        verdict = check_output("anything.png", checkers=(Missing(),))
        assert verdict.status == "unverified"
        assert "not installed" in verdict.detail

    def test_reports_the_failure_that_names_a_fix(self):
        # With nothing installed, both checkers fail. The message the user sees
        # should be the one that says what to install, not the screen saying it
        # could not decode the file.
        class Screen:
            name = "screen"
            can_approve = False

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(
                    status="unverified", checker="screen", detail="could not decode"
                )

        class Classifier:
            name = "content classifier"
            can_approve = True

            def check(self, _path: str) -> CheckVerdict:
                raise ModelUnavailableError("content classifier", "install the extra")

        verdict = check_output("x.png", checkers=(Screen(), Classifier()))
        assert verdict.status == "unverified"
        assert "install the extra" in verdict.detail
        assert "could not decode" not in verdict.detail

    def test_any_rejection_wins_over_any_approval(self):
        class Rejects:
            name = "screen"
            can_approve = False

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(status="rejected", checker="screen", detail="no")

        class Approves:
            name = "classifier"
            can_approve = True

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(status="passed", checker="classifier")

        for pool in [(Rejects(), Approves()), (Approves(), Rejects())]:
            assert check_output("x.png", checkers=pool).status == "rejected"

    def test_an_approving_classifier_does_approve(self):
        class Approves:
            name = "classifier"
            can_approve = True

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(status="passed", checker="classifier")

        assert check_output("x.png", checkers=(Approves(),)).safe_to_show is True


class TestARejectedImageIsDestroyed:
    def _job(self, out):
        return {
            "job_id": "j1",
            "prompt": "p",
            "output_path": str(out),
            "safety_checked": True,
        }

    def test_the_file_is_deleted_when_it_may_not_be_shown(self, tmp_path):
        class Rejects:
            name = "screen"
            can_approve = False

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(
                    status="rejected", checker="screen", detail="discarded"
                )

        out = tmp_path / "scene.png"
        outcome = run_job(self._job(out), use_mock=True, checkers=(Rejects(),))
        assert outcome.ok is False
        assert outcome.error_code == "output_rejected"
        # An unshowable picture left on disk is the thing the check is for.
        assert list(tmp_path.glob("*.png")) == []

    def test_it_is_also_deleted_when_nothing_could_check_it(self, tmp_path):
        out = tmp_path / "scene.png"
        outcome = run_job(self._job(out), use_mock=True, checkers=())
        assert outcome.ok is False
        assert outcome.error_code == "output_unverified"
        assert list(tmp_path.glob("*.png")) == []

    def test_it_survives_when_a_classifier_approves(self, tmp_path):
        class Approves:
            name = "classifier"
            can_approve = True

            def check(self, _path: str) -> CheckVerdict:
                return CheckVerdict(status="passed", checker="classifier")

        out = tmp_path / "scene.png"
        outcome = run_job(self._job(out), use_mock=True, checkers=(Approves(),))
        assert outcome.ok is True
        assert list(tmp_path.glob("*.mock.png"))


class TestSkinFractionScreen:
    def test_recognises_skin_and_not_sky(self):
        assert is_skin(*SKIN) is True
        assert is_skin(*SKY) is False
        assert is_skin(*CLOTH) is False

    def test_a_mostly_skin_frame_is_rejected(self):
        verdict = SkinFractionScreen().inspect(frame(skin=90, other=10))
        assert verdict.status == "rejected"
        assert "mostly_bare_skin" in verdict.reasons

    def test_a_clothed_scene_is_not_rejected(self):
        # Faces, hands and arms in a dressed scene. Not approved either — it
        # comes back unverified, which is still a refusal until a classifier runs.
        verdict = SkinFractionScreen().inspect(frame(skin=18, other=82, fill=CLOTH))
        assert verdict.status == "unverified"

    def test_the_threshold_is_where_it_says_it_is(self):
        assert skin_fraction(frame(skin=56, other=44)) > REJECT_ABOVE
        assert skin_fraction(frame(skin=50, other=50)) < REJECT_ABOVE

    def test_an_empty_frame_is_not_rejected_for_being_empty(self):
        assert skin_fraction(Pixels(0, 0, ())) == 0.0

    def test_an_unreadable_file_is_unverified_not_approved(self):
        verdict = SkinFractionScreen().check("/nonexistent/nope.png")
        assert verdict.status == "unverified"
        assert verdict.safe_to_show is False


class TestClassifierDecision:
    def test_exposed_anatomy_is_rejected(self):
        verdict = decide([{"class": "FEMALE_BREAST_EXPOSED", "score": 0.9}])
        assert verdict.status == "rejected"
        assert "FEMALE_BREAST_EXPOSED" in verdict.reasons

    def test_covered_anatomy_is_the_product_working(self):
        # Rejecting this would refuse most of what SceneFlow is for.
        verdict = decide(
            [
                {"class": "FEMALE_BREAST_COVERED", "score": 0.95},
                {"class": "BELLY_COVERED", "score": 0.8},
            ]
        )
        assert verdict.status == "passed"

    def test_a_low_confidence_guess_does_not_destroy_a_picture(self):
        verdict = decide([{"class": "MALE_GENITALIA_EXPOSED", "score": 0.2}])
        assert verdict.status == "passed"

    def test_one_confident_detection_among_many_still_rejects(self):
        verdict = decide(
            [
                {"class": "FACE_FEMALE", "score": 0.99},
                {"class": "ARMPITS_COVERED", "score": 0.9},
                {"class": "ANUS_EXPOSED", "score": 0.77},
            ]
        )
        assert verdict.status == "rejected"

    def test_nothing_detected_passes(self):
        assert decide([]).status == "passed"

    def test_the_message_says_nothing_was_kept(self):
        verdict = decide([{"class": "MALE_GENITALIA_EXPOSED", "score": 0.9}])
        assert "Nothing was kept" in verdict.detail


class TestNoSilentFallback:
    def test_the_classifier_refuses_loudly_when_absent(self):
        with pytest.raises(ModelUnavailableError) as exc:
            ContentClassifier().check("anything.png")
        assert "nudenet" in str(exc.value)
        assert "will not show a generated image that nothing has checked" in str(exc.value)

    def test_it_does_not_tell_anyone_to_use_a_mock_checker(self):
        # There is no mock checker and there must never be one. The image
        # model's advice ("request the mock adapter") is wrong here, and a
        # message offering a way around a safety check is worse than unhelpful.
        with pytest.raises(ModelUnavailableError) as exc:
            ContentClassifier().check("anything.png")
        assert "mock adapter" not in str(exc.value)
