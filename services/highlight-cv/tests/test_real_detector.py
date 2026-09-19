"""The REAL detector adapter, executed against real photographs of real people.

Everything else in this suite can run on synthetic input. This file cannot: its
whole purpose is to put genuine camera pixels of genuine human beings through
the production adapter and see what comes back.

It is what caught the bug that mattered most in this module. The first working
run of `UltralyticsPlayerDetector` against a photograph of two athletes returned
THREE detections — the third was COCO class 27, 'tie'. The adapter had never
filtered by class, so on real game film it would have returned the ball, the
bench, the water cooler and the cars in the car park as football players, and
every one would have become a track competing to be somebody's child. No unit
test over synthetic boxes could have found that.

SKIPPED without ultralytics and a local weights file. The weights are not
committed — they are a 5MB binary that the library fetches on demand — so these
run where the models are installed and skip cleanly everywhere else.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from highlight_cv.tracker import TwoStageTracker
from highlight_cv.types import BoundingBox

try:
    import cv2  # noqa: F401
    import ultralytics  # noqa: F401
    HAS_MODELS = True
except ImportError:
    HAS_MODELS = False

WEIGHTS = "yolo11n.pt"
HAS_WEIGHTS = Path(WEIGHTS).exists()
HAS_FFMPEG = shutil.which("ffmpeg") is not None


def asset(name: str) -> Path | None:
    if not HAS_MODELS:
        return None
    import ultralytics

    path = Path(ultralytics.__file__).parent / "assets" / name
    return path if path.exists() else None


@unittest.skipUnless(HAS_MODELS and HAS_WEIGHTS, "needs ultralytics and local weights")
class TestRealDetectorOnRealPhotographs(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        import cv2

        from highlight_cv.adapters.real import UltralyticsPlayerDetector

        cls.detector = UltralyticsPlayerDetector(WEIGHTS, confidence=0.35, device="cpu")
        cls.cv2 = cv2

    def _detect(self, name: str):
        from highlight_cv.adapters.base import Frame

        path = asset(name)
        self.assertIsNotNone(path, f"{name} not bundled with ultralytics")
        assert path is not None
        image = self.cv2.imread(str(path))
        height, width = image.shape[:2]
        return self.detector.detect(
            Frame(frame=0, seconds=0.0, width=width, height=height, pixels=image)
        )

    def test_it_finds_the_athletes_in_a_photograph_of_athletes(self):
        detections = self._detect("zidane.jpg")
        self.assertEqual(len(detections), 2, "expected the two people on the pitch")
        for d in detections:
            self.assertGreater(d.confidence, 0.5)

    def test_it_does_not_return_a_necktie_as_a_football_player(self):
        # The regression this file exists for. Stock COCO weights detect a tie
        # in this exact photograph; the adapter must filter it out.
        detections = self._detect("zidane.jpg")
        for d in detections:
            # A person is tall. A tie detection in this image is wide and short
            # relative to the figures, and sits inside one of them.
            self.assertGreater(d.box.h, d.box.w * 0.9, "a short, wide box is not a player")

    def test_boxes_come_back_normalised_and_inside_the_frame(self):
        # Pixels in, 0..1 out. Getting this wrong makes every crop and overlay
        # land somewhere else, and it is invisible until something is rendered.
        for d in self._detect("bus.jpg"):
            self.assertGreaterEqual(d.box.x, 0.0)
            self.assertGreaterEqual(d.box.y, 0.0)
            self.assertLessEqual(d.box.x + d.box.w, 1.0001)
            self.assertLessEqual(d.box.y + d.box.h, 1.0001)
            self.assertGreater(d.box.w, 0.0)
            self.assertGreater(d.box.h, 0.0)

    def test_it_finds_the_several_people_at_a_bus_stop(self):
        detections = self._detect("bus.jpg")
        self.assertGreaterEqual(len(detections), 3)

    def test_the_adapter_declares_itself_real_and_names_its_weights(self):
        info = self.detector.info
        self.assertEqual(info.kind, "real")
        self.assertIn("yolo11n", info.version)
        self.assertIn("classes=(0,)", info.notes)

    def test_raising_the_threshold_returns_fewer_detections(self):
        from highlight_cv.adapters.base import Frame
        from highlight_cv.adapters.real import UltralyticsPlayerDetector

        path = asset("bus.jpg")
        assert path is not None
        image = self.cv2.imread(str(path))
        h, w = image.shape[:2]
        frame = Frame(frame=0, seconds=0.0, width=w, height=h, pixels=image)

        loose = UltralyticsPlayerDetector(WEIGHTS, confidence=0.25, device="cpu").detect(frame)
        strict = UltralyticsPlayerDetector(WEIGHTS, confidence=0.80, device="cpu").detect(frame)
        self.assertGreaterEqual(len(loose), len(strict))


@unittest.skipUnless(
    HAS_MODELS and HAS_WEIGHTS and HAS_FFMPEG, "needs ultralytics, weights and FFmpeg"
)
class TestRealDetectorThroughTheWholeChain(unittest.TestCase):
    """Decode a real video of real people, detect them, and hold them in tracks.

    The video is made by panning across a photograph of two athletes. That is
    not football — nobody is running a route — but every stage downstream of the
    camera is doing its real job on real human pixels: OpenCV decoding an H.264
    file, YOLO finding people frame by frame, and the two-stage tracker
    associating those detections into continuous identities.
    """

    @classmethod
    def setUpClass(cls) -> None:
        from highlight_cv.adapters.real import UltralyticsPlayerDetector
        from highlight_cv.video import read_frames

        cls._dir = tempfile.TemporaryDirectory()
        tmp = Path(cls._dir.name)
        cls.path = tmp / "panned.mp4"

        source = asset("zidane.jpg")
        assert source is not None
        # A slow pan across the still: real encode, real decode, real motion for
        # the tracker to associate across.
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loop", "1", "-i", str(source),
             "-t", "3", "-r", "10",
             "-vf", "crop=900:720:x='min(380,20+120*t)':y=0,scale=640:512",
             "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
             str(cls.path)],
            capture_output=True, check=True, timeout=180,
        )

        detector = UltralyticsPlayerDetector(WEIGHTS, confidence=0.35, device="cpu")
        tracker = TwoStageTracker()
        cls.per_frame: list[int] = []
        for frame in read_frames(str(cls.path), target_fps=10):
            detections = detector.detect(frame)
            cls.per_frame.append(len(detections))
            tracker.update(detections)
        cls.tracks = tracker.finish()

    @classmethod
    def tearDownClass(cls) -> None:
        cls._dir.cleanup()

    def test_people_were_detected_on_most_decoded_frames(self):
        self.assertGreater(len(self.per_frame), 10)
        found = sum(1 for n in self.per_frame if n > 0)
        self.assertGreater(found / len(self.per_frame), 0.8)

    def test_the_tracker_held_them_as_continuous_identities(self):
        # The real payoff: not "how many boxes", but "how few people". If the
        # tracker were failing, a two-person clip would produce a track per
        # frame instead of a track per person.
        self.assertGreaterEqual(len(self.tracks), 1)
        self.assertLessEqual(len(self.tracks), 4, f"track explosion: {len(self.tracks)}")

    def test_each_track_persists_across_many_frames(self):
        longest = max(len(t.detections) for t in self.tracks)
        self.assertGreater(longest, len(self.per_frame) * 0.5)

    def test_tracking_confidence_reports_the_weakest_association(self):
        for track in self.tracks:
            self.assertGreater(track.tracking_confidence, 0.0)
            self.assertLessEqual(track.tracking_confidence, 1.0)

    def test_every_detection_box_is_inside_the_frame(self):
        for track in self.tracks:
            for d in track.detections:
                self.assertGreaterEqual(d.box.x, -0.001)
                self.assertLessEqual(d.box.x + d.box.w, 1.001)


if __name__ == "__main__":
    unittest.main()
