"""The worker end to end, with mock adapters and no GPU."""

import unittest

from highlight_cv.adapters.base import Frame, demo_adapter_names, is_fully_real
from highlight_cv.adapters.mock import (
    MockBallDetector,
    MockJerseyRecognizer,
    MockPlaySegmenter,
    MockPlayerDetector,
    MockReIdentifier,
    MockTeamClassifier,
    MockTracker,
)
from highlight_cv.errors import ModelUnavailableError
from highlight_cv.worker import AdapterSet, AnalysisRequest, run_analysis

FPS = 30.0


def frames(count=300):
    return [Frame(frame=i, seconds=i / FPS, width=1280, height=720) for i in range(count)]


def adapters():
    return AdapterSet(
        detector=MockPlayerDetector(),
        team_classifier=MockTeamClassifier(),
        jersey_recognizer=MockJerseyRecognizer(),
        tracker=MockTracker(),
        ball_detector=MockBallDetector(),
        segmenter=MockPlaySegmenter(),
    )


REQUEST = AnalysisRequest("video-1", "tenant-1", "player-1", 23, FPS)


class TestRunAnalysis(unittest.TestCase):
    def setUp(self):
        self.result = run_analysis(REQUEST, frames(), adapters())

    def test_produces_tracks_signals_and_a_team_palette(self):
        self.assertGreater(len(self.result.tracks), 0)
        self.assertEqual(len(self.result.signals), 300)
        self.assertEqual(len(self.result.team_palette), 2)

    def test_labels_itself_demo_because_the_adapters_are_demo(self):
        self.assertTrue(self.result.is_demo)
        self.assertEqual(self.result.adapter_kind, "demo")

    def test_a_caller_cannot_label_a_demo_run_real(self):
        # adapter_kind is computed from what actually ran, not passed in.
        self.assertEqual(
            run_analysis(REQUEST, frames(60), adapters()).adapter_kind, "demo"
        )

    def test_votes_a_number_for_the_athletes_track(self):
        numbers = {n for n, _ in self.result.voted_numbers.values() if n is not None}
        self.assertIn(23, numbers)

    def test_records_the_unreadable_frames_rather_than_dropping_them(self):
        readings = [r for rs in self.result.jersey_readings.values() for r in rs]
        self.assertGreater(len([r for r in readings if r.number is None]), 0)
        self.assertGreater(len([r for r in readings if r.number is not None]), 0)

    def test_ball_confidence_is_honestly_low(self):
        self.assertTrue(all(b.confidence < 0.7 for b in self.result.ball))

    def test_reports_progress_as_it_goes(self):
        seen = []
        run_analysis(REQUEST, frames(60), adapters(), on_progress=seen.append)
        self.assertTrue(seen)
        self.assertGreater(seen[-1].fraction, 0.5)

    def test_runs_on_an_empty_frame_list_without_inventing_football(self):
        result = run_analysis(REQUEST, [], adapters())
        self.assertEqual(result.tracks, [])
        self.assertEqual(result.signals, [])
        self.assertEqual(result.ball, [])


class TestTrackerSplitsOnOcclusion(unittest.TestCase):
    def test_a_gap_ends_the_track(self):
        # The important mock behaviour: a tracker that maintained an unbroken
        # track across an occlusion would hand the engine an answer the real
        # world does not, and re-identification would never be exercised.
        tracker = MockTracker()
        detector = MockPlayerDetector()
        for frame in frames(30):
            tracker.update(frame, detector.detect(frame))
        # Nothing visible for a while: everyone is in the pile.
        for frame in frames(30)[:10]:
            tracker.update(frame, [])
        tracks = tracker.flush()
        self.assertGreaterEqual(len(tracks), 2)


class TestAdapterLabelling(unittest.TestCase):
    def test_a_set_of_mocks_is_never_fully_real(self):
        self.assertFalse(is_fully_real(adapters().all()))
        self.assertEqual(len(demo_adapter_names(adapters().all())), 6)

    def test_the_reidentifier_returns_the_generated_embedding(self):
        detector = MockPlayerDetector()
        reid = MockReIdentifier()
        frame = frames(1)[0]
        detection = detector.detect(frame)[0]
        self.assertEqual(reid.embed(frame, detection), detection.embedding)


class TestRealAdaptersFailLoudly(unittest.TestCase):
    def test_a_missing_model_raises_rather_than_falling_back(self):
        # The whole point: falling back would produce a complete, plausible reel
        # of plays that never happened, attached to a real child's name.
        from highlight_cv.adapters.real import UltralyticsPlayerDetector

        with self.assertRaises(ModelUnavailableError) as ctx:
            UltralyticsPlayerDetector("football-yolo.pt")
        self.assertIn("not available", str(ctx.exception))
        self.assertIn("will not substitute demo output", str(ctx.exception))

    def test_every_real_adapter_fails_the_same_way(self):
        from highlight_cv.adapters import real

        for factory in (
            lambda: real.UltralyticsPlayerDetector("w.pt"),
            lambda: real.ByteTrackPlayerTracker(30.0),
            lambda: real.PaddleJerseyRecognizer(),
            lambda: real.YoloBallDetector("w.pt"),
        ):
            with self.assertRaises(ModelUnavailableError):
                factory()


if __name__ == "__main__":
    unittest.main()
