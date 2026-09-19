"""Temporal jersey voting — including the brief's worked example."""

import unittest

from highlight_cv.types import JerseyReading, VideoTimestamp
from highlight_cv.vote import temporal_vote

FPS = 30.0


def reading(frame, number, confidence, surface="back"):
    return JerseyReading(VideoTimestamp(frame, frame / FPS), number, confidence, surface)


class TestWorkedExample(unittest.TestCase):
    def test_stays_on_23_through_two_unreadable_frames(self):
        # Section 5, verbatim:
        #   14300 -> #23 .81 / 14305 -> unreadable
        #   14310 -> #23 .92 / 14315 -> unreadable
        # "Track should remain Player #23."
        vote = temporal_vote([
            reading(14300, 23, 0.81),
            reading(14305, None, None),
            reading(14310, 23, 0.92),
            reading(14315, None, None),
        ])
        self.assertEqual(vote.number, 23)
        self.assertGreater(vote.confidence, 0.9)
        self.assertEqual(vote.supporting_frames, 2)
        self.assertEqual(vote.abstaining_frames, 2)

    def test_a_long_unreadable_run_changes_nothing(self):
        readings = [reading(14300, 23, 0.81), reading(14310, 23, 0.92)]
        readings += [reading(f, None, None) for f in range(14320, 14500, 5)]
        vote = temporal_vote(readings)
        self.assertEqual(vote.number, 23)
        self.assertEqual(vote.abstaining_frames, 36)


class TestRefusal(unittest.TestCase):
    def test_nothing_readable_means_no_answer(self):
        vote = temporal_vote([reading(10, None, None), reading(20, None, None)])
        self.assertIsNone(vote.number)
        self.assertEqual(vote.confidence, 0.0)

    def test_no_readings_at_all(self):
        self.assertIsNone(temporal_vote([]).number)

    def test_a_bare_majority_is_not_an_identity(self):
        # 50.5% is a coin landing. The TypeScript engine shipped a bug here
        # until a test caught it, and this is the same guard on this side.
        vote = temporal_vote([
            reading(100, 23, 0.8), reading(105, 28, 0.8),
            reading(110, 23, 0.8), reading(115, 28, 0.8),
        ])
        self.assertIsNone(vote.number)
        self.assertGreater(vote.confidence, 0.5)
        self.assertLess(vote.confidence, 0.6)

    def test_one_weak_reading_cannot_carry_a_decision(self):
        vote = temporal_vote([reading(0, 23, 0.36)])
        self.assertEqual(vote.confidence, 1.0)
        self.assertIsNone(vote.number)

    def test_two_corroborating_mid_confidence_readings_do(self):
        self.assertEqual(temporal_vote([reading(0, 23, 0.36), reading(5, 23, 0.36)]).number, 23)

    def test_low_confidence_readings_abstain(self):
        vote = temporal_vote([reading(0, 23, 0.9), reading(5, 71, 0.1)])
        self.assertEqual(vote.number, 23)
        self.assertEqual(vote.abstaining_frames, 1)


class TestRecency(unittest.TestCase):
    def test_a_sustained_recent_reading_overcomes_a_stale_one(self):
        readings = [reading(0, 23, 0.9), reading(5, 23, 0.9)]
        readings += [reading(f, 28, 0.9) for f in range(900, 1001, 10)]
        self.assertEqual(temporal_vote(readings).number, 28)

    def test_a_back_number_outweighs_a_shoulder_number(self):
        back = temporal_vote([reading(0, 23, 0.8, "back")])
        shoulder = temporal_vote([reading(0, 23, 0.8, "shoulder")])
        self.assertEqual(back.number, 23)
        self.assertIsNone(shoulder.number)

    def test_can_be_asked_what_the_number_was_earlier(self):
        readings = [reading(0, 23, 0.95), reading(3000, 28, 0.95)]
        self.assertEqual(temporal_vote(readings, as_of_seconds=1).number, 23)


if __name__ == "__main__":
    unittest.main()
