"""Pipeline stages and honest progress."""

import unittest

from highlight_cv.errors import PipelineStageError
from highlight_cv.pipeline import STAGE_COST, STAGE_LABELS, Pipeline, Stage, StageStatus


class TestDefinition(unittest.TestCase):
    def test_covers_every_stage_in_the_brief(self):
        self.assertEqual(len(list(Stage)), 17)
        self.assertIs(list(Stage)[0], Stage.UPLOAD)
        self.assertIs(list(Stage)[-1], Stage.FINAL_EXPORT)

    def test_every_stage_has_a_cost_and_a_plain_english_label(self):
        for stage in Stage:
            self.assertIn(stage, STAGE_COST)
            self.assertTrue(STAGE_LABELS[stage])

    def test_labels_carry_no_engineering_jargon(self):
        # The people reading these are parents waiting on their child's film.
        for stage in Stage:
            label = STAGE_LABELS[stage].lower()
            for word in ("ocr", "reid", "homography", "bbox", "tensor", "inference", "nms"):
                self.assertNotIn(word, label)


class TestProgress(unittest.TestCase):
    def test_starts_at_zero(self):
        progress = Pipeline().progress()
        self.assertEqual(progress.fraction, 0.0)
        self.assertEqual(progress.label, "Waiting to start")

    def test_reaches_one_only_when_everything_is_done(self):
        pipeline = Pipeline()
        for stage in Stage:
            pipeline.succeed(stage)
        progress = pipeline.progress()
        self.assertEqual(progress.fraction, 1.0)
        self.assertEqual(progress.label, "Ready")

    def test_a_skipped_stage_counts_as_complete_not_as_missing_work(self):
        pipeline = Pipeline()
        for stage in Stage:
            pipeline.skip(stage) if stage is Stage.BALL_DETECTION else pipeline.succeed(stage)
        self.assertEqual(pipeline.progress().fraction, 1.0)

    def test_detection_moves_the_bar_more_than_scoring(self):
        a = Pipeline()
        a.succeed(Stage.PLAYER_DETECTION)
        b = Pipeline()
        b.succeed(Stage.HIGHLIGHT_SCORING)
        self.assertGreater(a.progress().fraction, b.progress().fraction)

    def test_a_stage_with_no_estimate_is_marked_indeterminate(self):
        pipeline = Pipeline()
        pipeline.start(Stage.PLAYER_DETECTION)
        self.assertTrue(pipeline.progress().indeterminate)

    def test_sub_progress_moves_the_bar(self):
        pipeline = Pipeline()
        pipeline.start(Stage.PLAYER_DETECTION)
        pipeline.report(Stage.PLAYER_DETECTION, 0.5)
        progress = pipeline.progress()
        self.assertFalse(progress.indeterminate)
        self.assertGreater(progress.fraction, 0.0)
        self.assertLess(progress.fraction, 0.2)

    def test_runaway_sub_progress_is_clamped(self):
        pipeline = Pipeline()
        pipeline.start(Stage.PLAYER_DETECTION)
        pipeline.report(Stage.PLAYER_DETECTION, 9.0)
        self.assertLessEqual(pipeline.progress().fraction, 1.0)


class TestFailure(unittest.TestCase):
    def test_a_failure_stops_the_bar_and_shows_the_real_reason(self):
        pipeline = Pipeline()
        pipeline.succeed(Stage.UPLOAD)
        pipeline.fail(Stage.TRANSCODE, "The file is not a video we can read.")
        progress = pipeline.progress()
        self.assertTrue(progress.failed)
        self.assertEqual(progress.label, "The file is not a video we can read.")
        self.assertLess(progress.fraction, 0.1)

    def test_a_failure_must_say_why(self):
        # "Failed" with no reason is what forces a customer to ask an engineer.
        with self.assertRaises(ValueError):
            Pipeline().fail(Stage.TRANSCODE, "   ")

    def test_run_records_the_failure_and_re_raises(self):
        pipeline = Pipeline()

        def boom():
            raise RuntimeError("no video stream in this file")

        with self.assertRaises(PipelineStageError):
            pipeline.run(Stage.TRANSCODE, boom)
        state = next(s for s in pipeline.stages if s.stage is Stage.TRANSCODE)
        self.assertIs(state.status, StageStatus.FAILED)
        self.assertEqual(state.error, "no video stream in this file")

    def test_run_marks_success_when_the_work_completes(self):
        pipeline = Pipeline()
        pipeline.run(Stage.TRANSCODE, lambda: None)
        state = next(s for s in pipeline.stages if s.stage is Stage.TRANSCODE)
        self.assertIs(state.status, StageStatus.SUCCEEDED)

    def test_progress_is_reported_to_the_callback(self):
        seen = []
        pipeline = Pipeline(on_progress=seen.append)
        pipeline.succeed(Stage.UPLOAD)
        self.assertTrue(seen)
        self.assertGreater(seen[-1].fraction, 0.0)


if __name__ == "__main__":
    unittest.main()
