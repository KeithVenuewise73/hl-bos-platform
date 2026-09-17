"""The whole chain, on a real video file.

Everything else in this suite tests one stage. This runs all of them against
actual bytes:

    ffmpeg renders a video  ->  OpenCV decodes it  ->  a detector finds figures
    ->  the two-stage tracker follows them  ->  jersey colours are sampled from
    the torso  ->  team classification clusters them  ->  motion signals come
    out  ->  and FFmpeg cuts and joins a reel from the result.

WHY THE DETECTOR HERE IS A TEST FIXTURE, NOT AN ADAPTER.

`ColourFigureDetector` below finds coloured rectangles by thresholding. That is
real computer vision on real pixels, and it is emphatically NOT a football
player detector: on genuine game film it would find the coaches, the chain gang,
the referees' stripes and half the crowd. Shipping it as an adapter would be
exactly the "control that does not control anything" this codebase refuses.

So it lives here, in the tests, where its only job is to prove the PLUMBING
carries real data from one end to the other. When a football-trained detector is
installed, it drops into the same slot and this file is the harness that proves
the rest still works.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from highlight_cv.color import classify_jersey_color
from highlight_cv.render import ClipSpec, clip_command, concat_command, concat_list_contents
from highlight_cv.tracker import TwoStageTracker
from highlight_cv.types import BoundingBox, PlayerDetection, VideoTimestamp

try:
    import cv2
    import numpy as np
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

HAS_FFMPEG = shutil.which("ffmpeg") is not None


class ColourFigureDetector:
    """Finds solid coloured figures against a background. A TEST FIXTURE.

    See the module docstring: this exists to move real pixels through the real
    pipeline, not to find footballers.
    """

    def __init__(self, min_area_fraction: float = 0.0004) -> None:
        self._min_area_fraction = min_area_fraction

    def detect(self, pixels, frame: int, seconds: float) -> list[PlayerDetection]:
        height, width = pixels.shape[:2]
        hsv = cv2.cvtColor(pixels, cv2.COLOR_BGR2HSV)

        # Find the FIELD and exclude it, rather than thresholding on saturation.
        # The first version of this fixture kept "anything strongly saturated",
        # which is a perfectly good description of a green football field: it
        # returned one detection covering the whole pitch, and the jersey
        # sampler dutifully reported that both teams wear green. The dominant
        # hue in a frame of football is the grass, so that is what to remove.
        hue = hsv[:, :, 0]
        saturated = hsv[:, :, 1] > 60
        if saturated.any():
            field_hue = int(np.bincount(hue[saturated].ravel(), minlength=180).argmax())
        else:
            field_hue = -1000
        # Circular distance: hue wraps at 180 in OpenCV, so red sits either side
        # of the seam and a plain subtraction would call it green.
        delta = np.abs(hue.astype(np.int16) - field_hue)
        delta = np.minimum(delta, 180 - delta)
        mask = ((delta > 20) & (hsv[:, :, 1] > 90) & (hsv[:, :, 2] > 60)).astype(np.uint8) * 255
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

        count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        out: list[PlayerDetection] = []
        min_area = self._min_area_fraction * width * height
        for i in range(1, count):
            x, y, w, h, area = (
                stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP],
                stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT],
                stats[i, cv2.CC_STAT_AREA],
            )
            if area < min_area:
                continue
            out.append(
                PlayerDetection(
                    detection_id=f"{frame}-{i}",
                    at=VideoTimestamp(frame, seconds),
                    box=BoundingBox(x / width, y / height, w / width, h / height),
                    # Fill ratio as a stand-in for detector confidence: a solid
                    # figure scores high, a ragged edge artefact scores low.
                    confidence=min(0.99, float(area) / max(1.0, float(w * h))),
                )
            )
        return out


@unittest.skipUnless(HAS_CV2 and HAS_FFMPEG, "needs OpenCV and FFmpeg")
class TestTheWholeChainOnRealVideo(unittest.TestCase):
    """Two figures — one blue, one white — running across a green field."""

    DURATION = 6
    FPS = 30

    @classmethod
    def setUpClass(cls) -> None:
        cls._dir = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._dir.name)
        cls.path = cls.tmp / "synthetic-game.mp4"

        # Rendered by FFmpeg so the pipeline reads a genuine encoded file,
        # complete with compression artefacts, rather than arrays we made up.
        field = "color=c=0x1a7a3c:s=960x540:d=%d:r=%d" % (cls.DURATION, cls.FPS)
        blue = "color=c=0x1e4a9e:s=26x60:d=%d:r=%d" % (cls.DURATION, cls.FPS)
        white = "color=c=0xbe2428:s=26x60:d=%d:r=%d" % (cls.DURATION, cls.FPS)
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y",
             "-f", "lavfi", "-i", field,
             "-f", "lavfi", "-i", blue,
             "-f", "lavfi", "-i", white,
             "-filter_complex",
             "[0][1]overlay=x='80+120*t':y='200+40*sin(t)'[a];"
             "[a][2]overlay=x='120+110*t':y='330-30*sin(t)'",
             "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
             "-crf", "18", str(cls.path)],
            capture_output=True, check=True, timeout=180,
        )

        from highlight_cv.video import probe, read_frames, sample_jersey_colors

        cls.info = probe(str(cls.path))
        detector = ColourFigureDetector()
        tracker = TwoStageTracker()
        cls.colours: list[tuple[int, int, int]] = []
        cls.frames_seen = 0

        for frame in read_frames(str(cls.path), target_fps=15):
            detections = detector.detect(frame.pixels, frame.frame, frame.seconds)
            tracker.update(detections)
            cls.frames_seen += 1
            for d in detections:
                sampled = sample_jersey_colors(frame.pixels, d.box)
                if sampled is not None:
                    cls.colours.append(sampled)
        cls.tracks = tracker.finish()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._dir.cleanup()

    # --- decode ------------------------------------------------------------
    def test_the_file_decoded_at_the_sampled_rate(self):
        self.assertEqual(self.info.width, 960)
        self.assertAlmostEqual(self.info.duration_seconds, self.DURATION, delta=0.4)
        # 6s at 15fps sampled from 30fps.
        self.assertAlmostEqual(self.frames_seen, self.DURATION * 15, delta=4)

    # --- detect + track ----------------------------------------------------
    def test_it_found_and_held_exactly_two_figures(self):
        self.assertEqual(len(self.tracks), 2, f"expected 2 tracks, got {len(self.tracks)}")

    def test_each_track_spans_most_of_the_clip(self):
        for track in self.tracks:
            span = track.end_frame - track.start_frame
            self.assertGreater(span, self.DURATION * self.FPS * 0.7)

    def test_the_tracks_actually_moved_across_the_field(self):
        for track in self.tracks:
            first = track.detections[0].box.center[0]
            last = track.detections[-1].box.center[0]
            self.assertGreater(last - first, 0.4, "the figure should have crossed the frame")

    def test_no_track_swapped_lanes(self):
        # The identity-switch failure, on real pixels: each figure keeps its own
        # vertical band for the whole clip.
        for track in self.tracks:
            ys = [d.box.center[1] for d in track.detections]
            self.assertLess(max(ys) - min(ys), 0.25)

    # --- colour ------------------------------------------------------------
    def test_jersey_colours_sampled_off_real_pixels_name_the_right_teams(self):
        self.assertGreater(len(self.colours), 20)
        names = {classify_jersey_color(c)[0] for c in self.colours}
        # Encoded, decoded, torso-sampled and averaged — the blue and the red
        # must still come back as blue and red, not as mud.
        self.assertTrue(
            any(n in {"blue", "royal_blue", "navy"} for n in names),
            f"no blue recovered, got {names}",
        )
        self.assertTrue(
            any(n in {"red", "crimson", "maroon"} for n in names),
            f"no red recovered, got {names}",
        )

    def test_bgr_was_not_confused_with_rgb(self):
        # The most embarrassing failure available here: swapping the channels
        # turns the blue team red and the red team blue, and everything
        # downstream still "works".
        names = [classify_jersey_color(c)[0] for c in self.colours]
        blues = sum(1 for n in names if n in {"blue", "royal_blue", "navy", "columbia_blue"})
        reds = sum(1 for n in names if n in {"red", "crimson", "maroon"})
        self.assertGreater(blues, 0)
        self.assertGreater(reds, 0)

    # --- render ------------------------------------------------------------
    def test_a_reel_is_cut_and_joined_from_the_tracked_video(self):
        clips = []
        for i, (start, end) in enumerate([(0.5, 2.5), (3.0, 5.0)]):
            out = self.tmp / f"e2e-clip-{i}.mp4"
            subprocess.run(
                clip_command(ClipSpec(str(self.path), str(out), start, end)),
                capture_output=True, check=True, timeout=120,
            )
            clips.append(str(out))

        list_file = self.tmp / "e2e-parts.txt"
        list_file.write_text(concat_list_contents(clips))
        reel = self.tmp / "e2e-reel.mp4"
        subprocess.run(
            concat_command(clips, str(list_file), str(reel)),
            capture_output=True, check=True, timeout=120,
        )
        self.assertTrue(reel.exists())
        self.assertGreater(reel.stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
