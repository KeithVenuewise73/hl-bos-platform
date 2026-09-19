"""The two-stage tracker.

The tests that matter here are the football ones: a player who goes into a pile
and comes out, a weak detection that must keep a track but must never start one,
and two players crossing without swapping identities.
"""

import unittest

from highlight_cv.tracker import TrackerConfig, TwoStageTracker, iou
from highlight_cv.types import BoundingBox, PlayerDetection, VideoTimestamp

FPS = 30.0


def det(frame: int, x: float, y: float, conf: float, ident: str = "d") -> PlayerDetection:
    return PlayerDetection(
        detection_id=f"{ident}-{frame}",
        at=VideoTimestamp(frame, frame / FPS),
        box=BoundingBox(x, y, 0.05, 0.12),
        confidence=conf,
    )


class TestIou(unittest.TestCase):
    def test_identical_boxes(self):
        b = BoundingBox(0.2, 0.3, 0.1, 0.2)
        self.assertAlmostEqual(iou(b, b), 1.0, places=9)

    def test_disjoint_boxes(self):
        self.assertEqual(iou(BoundingBox(0, 0, 0.1, 0.1), BoundingBox(0.5, 0.5, 0.1, 0.1)), 0.0)

    def test_touching_edges_do_not_overlap(self):
        self.assertEqual(iou(BoundingBox(0, 0, 0.1, 0.1), BoundingBox(0.1, 0, 0.1, 0.1)), 0.0)

    def test_half_overlap(self):
        a = BoundingBox(0, 0, 0.2, 0.2)
        b = BoundingBox(0.1, 0, 0.2, 0.2)
        self.assertAlmostEqual(iou(a, b), 1 / 3, places=6)


class TestBasicTracking(unittest.TestCase):
    def test_follows_one_player_across_frames(self):
        t = TwoStageTracker()
        for f in range(20):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.9)])
        tracks = t.finish()
        self.assertEqual(len(tracks), 1)
        self.assertEqual(len(tracks[0].detections), 20)

    def test_keeps_two_players_apart(self):
        t = TwoStageTracker()
        for f in range(20):
            t.update([
                det(f, 0.2 + f * 0.01, 0.30, 0.9, "a"),
                det(f, 0.2 + f * 0.01, 0.70, 0.9, "b"),
            ])
        tracks = t.finish()
        self.assertEqual(len(tracks), 2)
        for track in tracks:
            # Neither track may contain detections from both lanes.
            lanes = {round(d.box.y, 2) for d in track.detections}
            self.assertEqual(len(lanes), 1)

    def test_drops_a_one_frame_false_positive(self):
        # A box that appears once and never again is noise, not a player.
        t = TwoStageTracker()
        for f in range(20):
            dets = [det(f, 0.2 + f * 0.01, 0.5, 0.9)]
            if f == 7:
                dets.append(det(f, 0.85, 0.15, 0.9, "ghost"))
            t.update(dets)
        tracks = t.finish()
        self.assertEqual(len(tracks), 1)
        self.assertEqual(t.dropped_as_noise, 0)  # already drained by finish()

    def test_reports_the_weakest_link_not_the_average(self):
        t = TwoStageTracker()
        for f in range(10):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.35 if f == 5 else 0.95)])
        track = t.finish()[0]
        self.assertAlmostEqual(track.tracking_confidence, 0.35, places=6)


class TestByteTrackBehaviour(unittest.TestCase):
    """The two-stage association, which is the whole reason for this algorithm."""

    def test_a_weak_detection_keeps_a_track_alive(self):
        # Frames 10-14 are weak — the player is in a pile. A tracker that
        # discarded them would end the track exactly when the play matters.
        t = TwoStageTracker()
        for f in range(25):
            conf = 0.25 if 10 <= f <= 14 else 0.9
            t.update([det(f, 0.2 + f * 0.01, 0.5, conf)])
        tracks = t.finish()
        self.assertEqual(len(tracks), 1, "the weak stretch split the track")
        self.assertEqual(len(tracks[0].detections), 25)

    def test_a_weak_detection_can_never_start_a_track(self):
        # The asymmetry that stops a blur becoming a player who was never there.
        t = TwoStageTracker()
        for f in range(20):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.20)])
        self.assertEqual(t.finish(), [])

    def test_noise_below_the_low_threshold_is_discarded_entirely(self):
        t = TwoStageTracker()
        for f in range(20):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.9), det(f, 0.8, 0.2, 0.02, "noise")])
        self.assertEqual(len(t.finish()), 1)


class TestOcclusion(unittest.TestCase):
    def test_survives_a_gap_shorter_than_the_buffer(self):
        t = TwoStageTracker()
        for f in range(10):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.9)])
        for _ in range(10):          # ten frames fully hidden
            t.update([])
        for f in range(20, 30):
            t.update([det(f, 0.2 + f * 0.01, 0.5, 0.9)])
        tracks = t.finish()
        self.assertEqual(len(tracks), 1, "a third-of-a-second pile split the track")

    def test_closes_a_track_after_the_buffer_expires(self):
        cfg = TrackerConfig(track_buffer=5)
        t = TwoStageTracker(cfg)
        for f in range(10):
            t.update([det(f, 0.3, 0.5, 0.9)])
        for _ in range(20):          # gone far longer than the buffer
            t.update([])
        for f in range(40, 50):
            t.update([det(f, 0.3, 0.5, 0.9)])
        # Two separate tracks is the CORRECT answer: the tracker genuinely lost
        # him. Reconnecting them is re-identification's job, one level up, where
        # a human can confirm or reject the join.
        self.assertEqual(len(t.finish()), 2)

    def test_predicts_through_a_gap_rather_than_freezing(self):
        # He keeps running while hidden. Matching against his stale box would
        # miss him on re-appearance.
        t = TwoStageTracker()
        for f in range(10):
            t.update([det(f, 0.20 + f * 0.02, 0.5, 0.9)])
        t.update([])
        t.update([])
        t.update([det(12, 0.20 + 12 * 0.02, 0.5, 0.9)])
        for f in range(13, 20):
            t.update([det(f, 0.20 + f * 0.02, 0.5, 0.9)])
        self.assertEqual(len(t.finish()), 1)


class TestConfiguration(unittest.TestCase):
    def test_thresholds_are_documented_defaults_not_measurements(self):
        cfg = TrackerConfig()
        self.assertGreater(cfg.high_threshold, cfg.low_threshold)
        self.assertGreater(cfg.match_iou, cfg.match_iou_low)
        self.assertGreaterEqual(cfg.confirm_after, 2)

    def test_an_empty_stream_produces_no_tracks(self):
        t = TwoStageTracker()
        for _ in range(10):
            t.update([])
        self.assertEqual(t.finish(), [])

    def test_finish_is_idempotent(self):
        t = TwoStageTracker()
        for f in range(10):
            t.update([det(f, 0.3, 0.5, 0.9)])
        self.assertEqual(len(t.finish()), 1)
        self.assertEqual(t.finish(), [])


if __name__ == "__main__":
    unittest.main()
