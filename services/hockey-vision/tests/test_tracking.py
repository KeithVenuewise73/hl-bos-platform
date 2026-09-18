"""Tracking tests.

Association is the part of this pipeline whose bugs are silent: a broken
tracker still returns tracks, just the wrong ones. So these tests go after the
specific failures that matter — identity swapped between two players, a new id
issued after an occlusion, ghost tracks from single-frame noise.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hockey_vision.tracking import (  # noqa: E402
    Box,
    ByteTracker,
    Detection,
    association_score,
    iou,
)


def box(x: float, y: float, w: float = 40, h: float = 90) -> Box:
    return Box(x, y, w, h)


class TestIou:
    def test_identical_boxes_overlap_completely(self) -> None:
        assert iou(box(0, 0), box(0, 0)) == 1.0

    def test_disjoint_boxes_do_not_overlap(self) -> None:
        assert iou(box(0, 0), box(500, 500)) == 0.0

    def test_touching_edges_are_not_an_overlap(self) -> None:
        assert iou(Box(0, 0, 10, 10), Box(10, 0, 10, 10)) == 0.0

    def test_half_overlap_is_a_third(self) -> None:
        # Two 10x10 boxes sharing half their area: intersection 50, union 150.
        assert abs(iou(Box(0, 0, 10, 10), Box(5, 0, 10, 10)) - (50 / 150)) < 1e-9

    def test_a_zero_area_box_never_matches(self) -> None:
        assert iou(Box(0, 0, 0, 0), box(0, 0)) == 0.0


class TestAssociationScore:
    """Association has to survive a low sampling rate, not just a high one."""

    def test_overlap_is_used_when_there_is_overlap(self) -> None:
        assert association_score(box(0, 0), box(0, 0)) == 1.0

    def test_nearby_boxes_still_associate_without_overlapping(self) -> None:
        # At 5Hz a skater moves further than their own box is wide. Requiring
        # overlap here means issuing a new track id on every analysed frame.
        assert association_score(box(100, 200), box(160, 200)) > 0.2

    def test_a_box_across_the_rink_never_associates(self) -> None:
        assert association_score(box(100, 200), box(900, 200)) == 0.0

    def test_overlap_always_outranks_mere_nearness(self) -> None:
        overlapping = association_score(Box(0, 0, 40, 90), Box(20, 0, 40, 90))
        adjacent = association_score(Box(0, 0, 40, 90), Box(60, 0, 40, 90))
        assert overlapping > adjacent

    def test_proximity_is_measured_in_box_sizes_not_pixels(self) -> None:
        # The same relative displacement must score the same whether the
        # footage is 540p or 4K.
        small = association_score(Box(0, 0, 40, 90), Box(60, 0, 40, 90))
        large = association_score(Box(0, 0, 160, 360), Box(240, 0, 160, 360))
        assert abs(small - large) < 1e-9


class TestTracker:
    def test_follows_one_player_across_frames(self) -> None:
        tracker = ByteTracker()
        for i in range(10):
            tracker.update(i, i * 0.2, [Detection(box(100 + i * 5, 200), 0.9)])
        tracks = tracker.finish()
        assert len(tracks) == 1
        assert len(tracks[0].observations) == 10

    def test_keeps_two_players_apart(self) -> None:
        tracker = ByteTracker()
        for i in range(10):
            tracker.update(
                i, i * 0.2,
                [Detection(box(100 + i * 5, 200), 0.9), Detection(box(600 - i * 5, 200), 0.9)],
            )
        tracks = tracker.finish()
        assert len(tracks) == 2
        # Each track must stay on its own side; a swap here is the single worst
        # tracking bug, because it puts another child in the reel.
        for track in tracks:
            xs = [o.box.x for o in track.observations]
            assert xs == sorted(xs) or xs == sorted(xs, reverse=True)

    def test_carries_a_player_through_an_occlusion(self) -> None:
        # Frames 4-6 see the player only faintly: this is the exact case the
        # second, low-confidence matching pass exists for.
        tracker = ByteTracker()
        for i in range(12):
            score = 0.2 if 4 <= i <= 6 else 0.9
            tracker.update(i, i * 0.2, [Detection(box(100 + i * 5, 200), score)])
        tracks = tracker.finish()
        assert len(tracks) == 1, "a screened player must not become a second player"
        assert len(tracks[0].observations) == 12

    def test_a_faint_box_alone_does_not_start_a_player(self) -> None:
        tracker = ByteTracker()
        for i in range(10):
            tracker.update(i, i * 0.2, [Detection(box(100, 200), 0.2)])
        assert tracker.finish() == []

    def test_discards_boxes_below_the_floor(self) -> None:
        tracker = ByteTracker(low_threshold=0.15)
        for i in range(10):
            tracker.update(i, i * 0.2, [Detection(box(100, 200), 0.05)])
        assert tracker.finish() == []

    def test_drops_a_one_frame_ghost(self) -> None:
        tracker = ByteTracker(min_length=3)
        tracker.update(0, 0.0, [Detection(box(100, 200), 0.9)])
        for i in range(1, 30):
            tracker.update(i, i * 0.2, [])
        assert tracker.finish() == []

    def test_expires_a_track_that_never_comes_back(self) -> None:
        tracker = ByteTracker(max_missed=3)
        for i in range(5):
            tracker.update(i, i * 0.2, [Detection(box(100, 200), 0.9)])
        for i in range(5, 20):
            tracker.update(i, i * 0.2, [])
        tracks = tracker.finish()
        assert len(tracks) == 1
        assert len(tracks[0].observations) == 5

    def test_predicts_forward_so_a_fast_skater_is_not_lost(self) -> None:
        # A player moving 60px per analysed frame, missing for two frames. With
        # no motion prediction the reappearance has zero IoU with the last box
        # and becomes a new player -- exactly when they are most worth tracking.
        tracker = ByteTracker()
        for i in range(4):
            tracker.update(i, i * 0.2, [Detection(box(100 + i * 60, 200), 0.9)])
        tracker.update(4, 0.8, [])
        tracker.update(5, 1.0, [])
        tracker.update(6, 1.2, [Detection(box(100 + 6 * 60, 200), 0.9)])
        tracks = tracker.finish()
        assert len(tracks) == 1

    def test_assigns_a_new_id_to_a_genuinely_new_player(self) -> None:
        tracker = ByteTracker()
        for i in range(6):
            tracker.update(i, i * 0.2, [Detection(box(100, 200), 0.9)])
        for i in range(6, 12):
            tracker.update(
                i, i * 0.2,
                [Detection(box(100, 200), 0.9), Detection(box(900, 600), 0.9)],
            )
        tracks = tracker.finish()
        assert len(tracks) == 2
        assert len({t.id for t in tracks}) == 2

    def test_handles_a_frame_with_nothing_in_it(self) -> None:
        tracker = ByteTracker()
        tracker.update(0, 0.0, [])
        assert tracker.finish() == []


class TestSamplingRate:
    def test_follows_a_skater_sampled_at_five_frames_a_second(self) -> None:
        """The real-world case: a full-speed rush in a 1080p proxy at 5Hz.

        A player crossing the frame in three seconds moves roughly 120px per
        analysed frame. Their boxes never overlap, so this is entirely carried
        by proximity association.
        """
        tracker = ByteTracker()
        for i in range(15):
            tracker.update(i, i * 0.2, [Detection(box(50 + i * 120, 400), 0.9)])
        tracks = tracker.finish()
        assert len(tracks) == 1, "a full-speed rush must be one player, not fifteen"
        assert len(tracks[0].observations) == 15
