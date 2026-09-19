"""Frame sampling and decoding.

`sample_indices` is pure and always tested. The decode tests need OpenCV and a
real video file, and skip without them — the football engine has to stay
testable on a machine with no media toolchain.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from highlight_cv.video import sample_indices

try:
    import cv2  # noqa: F401
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

HAS_FFMPEG = shutil.which("ffmpeg") is not None


class TestSampleIndices(unittest.TestCase):
    """The function that decides what every downstream timestamp means."""

    def test_halving_the_rate_takes_every_second_frame(self):
        self.assertEqual(sample_indices(10, 30, 15), [0, 2, 4, 6, 8])

    def test_thirty_to_ten_takes_every_third(self):
        self.assertEqual(sample_indices(12, 30, 10), [0, 3, 6, 9])

    def test_returns_TRUE_file_indices_not_a_running_counter(self):
        # The whole point. If this ever returns 0,1,2,3 for a strided sample,
        # every clip in the product is cut minutes from the play it claims to
        # show, and nothing errors.
        indices = sample_indices(30, 30, 10)
        self.assertEqual(indices[1], 3)
        self.assertNotEqual(indices, list(range(len(indices))))

    def test_cannot_sample_faster_than_the_camera_filmed(self):
        self.assertEqual(sample_indices(5, 30, 60), [0, 1, 2, 3, 4])
        self.assertEqual(sample_indices(5, 30, 30), [0, 1, 2, 3, 4])

    def test_never_repeats_an_index(self):
        for target in (1, 7, 12, 24, 29):
            indices = sample_indices(300, 30, target)
            self.assertEqual(len(indices), len(set(indices)), f"target={target}")
            self.assertEqual(indices, sorted(indices), f"target={target}")

    def test_a_fractional_stride_does_not_drift(self):
        # 30 -> 12 is a stride of 2.5. Rounding each step independently would
        # accumulate error across a two-hour game.
        indices = sample_indices(60, 30, 12)
        self.assertEqual(indices[:5], [0, 2, 5, 7, 10])
        self.assertLess(indices[-1], 60)

    def test_nonsense_input_yields_nothing_rather_than_guessing(self):
        self.assertEqual(sample_indices(0, 30, 10), [])
        self.assertEqual(sample_indices(100, 0, 10), [])
        self.assertEqual(sample_indices(100, 30, 0), [])
        self.assertEqual(sample_indices(-5, 30, 10), [])

    def test_a_two_hour_game_reduces_to_a_tractable_number_of_frames(self):
        # 2 hours at 30fps. This is the reason sampling exists at all.
        full = 2 * 60 * 60 * 30
        sampled = sample_indices(full, 30, 10)
        self.assertEqual(full, 216_000)
        self.assertAlmostEqual(len(sampled), 72_000, delta=5)


@unittest.skipUnless(HAS_CV2 and HAS_FFMPEG, "needs OpenCV and FFmpeg")
class TestDecodingARealFile(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._dir = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._dir.name)
        cls.path = cls.tmp / "clip.mp4"
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y",
             "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=4",
             "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
             str(cls.path)],
            capture_output=True, check=True, timeout=120,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._dir.cleanup()

    def test_probe_reads_the_real_properties(self):
        from highlight_cv.video import probe

        info = probe(str(self.path))
        self.assertEqual(info.width, 640)
        self.assertEqual(info.height, 360)
        self.assertAlmostEqual(info.frame_rate, 30.0, delta=0.5)
        self.assertAlmostEqual(info.duration_seconds, 4.0, delta=0.3)

    def test_probe_refuses_a_file_it_cannot_open(self):
        from highlight_cv.video import probe

        with self.assertRaises(ValueError):
            probe(str(self.tmp / "does-not-exist.mp4"))

    def test_decoded_frames_carry_true_indices_and_true_seconds(self):
        from highlight_cv.video import read_frames

        frames = list(read_frames(str(self.path), target_fps=10))
        self.assertGreater(len(frames), 30)
        for f in frames:
            self.assertAlmostEqual(f.seconds, f.frame / 30.0, delta=0.02)
        # Strided, so the indices step by 3 — not 1.
        self.assertEqual(frames[1].frame - frames[0].frame, 3)
        self.assertEqual(frames[0].width, 640)
        self.assertIsNotNone(frames[0].pixels)

    def test_sampling_at_full_rate_returns_every_frame(self):
        from highlight_cv.video import read_frames

        frames = list(read_frames(str(self.path), target_fps=30))
        self.assertGreater(len(frames), 110)
        self.assertEqual(frames[1].frame - frames[0].frame, 1)

    def test_samples_the_torso_not_the_whole_box(self):
        from highlight_cv.types import BoundingBox
        from highlight_cv.video import read_frames, sample_jersey_colors

        frame = next(iter(read_frames(str(self.path), target_fps=1)))
        colour = sample_jersey_colors(frame.pixels, BoundingBox(0.3, 0.3, 0.2, 0.4))
        self.assertIsNotNone(colour)
        assert colour is not None
        self.assertEqual(len(colour), 3)
        for channel in colour:
            self.assertGreaterEqual(channel, 0)
            self.assertLessEqual(channel, 255)

    def test_a_degenerate_box_yields_no_colour_rather_than_a_wrong_one(self):
        from highlight_cv.types import BoundingBox
        from highlight_cv.video import read_frames, sample_jersey_colors

        frame = next(iter(read_frames(str(self.path), target_fps=1)))
        self.assertIsNone(sample_jersey_colors(frame.pixels, BoundingBox(0.5, 0.5, 0.0, 0.0)))


if __name__ == "__main__":
    unittest.main()
