"""End-to-end tests against real video files.

These write actual MP4s with OpenCV, run them through ffmpeg and through the
whole detection/tracking/jersey pipeline, and assert on what comes back. They
are slower than the unit tests and they are the ones that matter: this service
exists to answer the question the HighlightAI evidence audit asked — is there
real processing code here, or only an interface that looks like one.

Skipped, not silently passed, when ffmpeg is missing. A test that quietly
succeeds without running is worse than no test.
"""

from __future__ import annotations

import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hockey_vision.api import Service, Settings, UnsafeKey, resolve_key  # noqa: E402
from hockey_vision.detectors import (  # noqa: E402
    DetectorUnavailable,
    MotionDetector,
    ScriptedDetector,
    YoloDetector,
    select_detector,
)
from hockey_vision.ocr import NumberRead, ScriptedNumberReader  # noqa: E402
from hockey_vision.pipeline import analyse_video  # noqa: E402
from hockey_vision.tracking import Box, Detection  # noqa: E402
from hockey_vision.video import (  # noqa: E402
    VideoError,
    cut_clip,
    ffmpeg_available,
    make_proxy,
    probe,
    render_reel,
)

needs_ffmpeg = pytest.mark.skipif(
    not ffmpeg_available(), reason="ffmpeg and ffprobe are not installed"
)

WIDTH, HEIGHT, FPS = 640, 360, 30
NAVY = (90, 40, 20)
WHITE = (240, 240, 240)


def draw_skater(frame: np.ndarray, x: int, y: int, jersey: tuple[int, int, int]) -> None:
    """A skater shaped enough like one to be a fair test.

    Helmet, jersey, then dark pants and socks. The proportions matter: a player
    is not a monochrome rectangle, and testing against one lets a detector pass
    that would fail on a white jersey against white ice. The dark lower body is
    also what gives a white-jerseyed player any contrast at all against the
    rink, which is exactly why real players are visible and a plain white block
    is not.
    """
    w, h = 26, 76
    cv2.rectangle(frame, (x + 6, y), (x + 20, y + 12), (40, 40, 40), -1)      # helmet
    cv2.rectangle(frame, (x, y + 14), (x + w, y + 46), jersey, -1)            # jersey
    cv2.rectangle(frame, (x + 3, y + 46), (x + w - 3, y + h), (35, 35, 35), -1)  # pants


def write_rink_video(path: Path, seconds: int = 4) -> Path:
    """A synthetic rink: pale ice, one navy skater, one white skater.

    Not a stand-in for hockey footage — it is a controlled input with a known
    right answer, which is what lets these tests assert that the pipeline found
    TWO players, in the RIGHT colours, moving the RIGHT way.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT)
    )
    assert writer.isOpened(), "OpenCV could not open a video writer"
    total = seconds * FPS
    for i in range(total):
        frame = np.full((HEIGHT, WIDTH, 3), 235, dtype=np.uint8)
        # Faint boards, so the background is not perfectly uniform.
        cv2.rectangle(frame, (0, 0), (WIDTH, 20), (200, 200, 200), -1)
        # The navy skater crosses left to right at a steady clip.
        draw_skater(frame, int(40 + (i / total) * (WIDTH - 120)), 140, NAVY)
        # The white skater comes back the other way.
        draw_skater(frame, int(WIDTH - 80 - (i / total) * (WIDTH - 140)), 240, WHITE)
        writer.write(frame)
    writer.release()
    assert path.exists() and path.stat().st_size > 0
    return path


class TestVideoIo:
    @needs_ffmpeg
    def test_probes_a_real_file(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        measured = probe(source)
        assert measured.width == WIDTH
        assert measured.height == HEIGHT
        assert 3.5 < measured.duration_seconds < 4.5
        assert 29 < measured.frame_rate < 31
        assert measured.size_bytes > 0

    def test_refuses_a_file_that_is_not_there(self, tmp_path: Path) -> None:
        with pytest.raises(VideoError, match="no file"):
            probe(tmp_path / "nothing.mp4")

    @needs_ffmpeg
    def test_refuses_a_file_that_is_not_a_video(self, tmp_path: Path) -> None:
        # An honest refusal, not a zero-duration Probe that the pipeline would
        # then treat as a real but empty video.
        fake = tmp_path / "notavideo.mp4"
        fake.write_text("this is not a video", encoding="utf8")
        with pytest.raises(VideoError):
            probe(fake)

    @needs_ffmpeg
    def test_makes_a_smaller_proxy_and_leaves_the_original_alone(
        self, tmp_path: Path
    ) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        original_size = source.stat().st_size
        proxy_path = make_proxy(source, tmp_path / "proxy.mp4", max_height=180)
        measured = probe(proxy_path)
        assert measured.height <= 180
        assert measured.width % 2 == 0, "H.264 cannot encode odd dimensions"
        # A parent's only copy of a game is not something to re-encode in place.
        assert source.stat().st_size == original_size
        assert probe(source).height == HEIGHT

    @needs_ffmpeg
    def test_cuts_a_clip_at_the_time_it_was_asked_for(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        clip = cut_clip(source, tmp_path / "clip.mp4", 1.0, 2.5)
        measured = probe(clip)
        # Re-encoding rather than stream-copying is what buys this accuracy. A
        # keyframe-aligned cut can start up to a GOP late, reliably removing
        # the start of the play the clip was cut for.
        assert 1.3 < measured.duration_seconds < 1.7

    @needs_ffmpeg
    def test_refuses_an_inverted_clip(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        with pytest.raises(VideoError, match="end after it starts"):
            cut_clip(source, tmp_path / "bad.mp4", 3.0, 1.0)

    @needs_ffmpeg
    def test_renders_a_reel_whose_length_is_the_sum_of_its_cuts(
        self, tmp_path: Path
    ) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        reel = render_reel(
            source, tmp_path / "reel.mp4", [(0.5, 1.5), (2.0, 3.0)]
        )
        measured = probe(reel)
        assert 1.6 < measured.duration_seconds < 2.4
        assert measured.width == WIDTH

    @needs_ffmpeg
    def test_refuses_to_render_a_reel_with_no_clips(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        with pytest.raises(VideoError, match="at least one clip"):
            render_reel(source, tmp_path / "reel.mp4", [])


class TestAnalysis:
    """The whole pass, on a real file, with a real detector."""

    @needs_ffmpeg
    def test_finds_both_skaters_and_reads_their_colours(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        result = analyse_video(source, MotionDetector(), frame_stride=3)

        assert result.frames_analysed > 20
        assert result.frame_width == WIDTH
        assert len(result.tracks) >= 2, "two skaters were on the ice"

        colours = {
            o.jersey_color_id
            for track in result.tracks
            for o in track.observations
            if o.jersey_color_id is not None
        }
        # The jerseys really were navy and white, and the classifier really
        # read them off decoded pixels.
        assert "navy" in colours
        assert "white" in colours

    @needs_ffmpeg
    def test_cannot_see_a_player_with_no_contrast_and_does_not_pretend_to(
        self, tmp_path: Path
    ) -> None:
        """A real, reportable limit of motion detection.

        A white jersey on white ice with nothing darker on the player is five
        grey levels from the background, and background subtraction cannot see
        it. The right behaviour is to find nothing rather than to invent
        something, and the service's notes already warn that this detector has
        no model behind it.
        """
        path = tmp_path / "invisible.mp4"
        writer = cv2.VideoWriter(
            str(path), cv2.VideoWriter_fourcc(*"mp4v"), FPS, (WIDTH, HEIGHT)
        )
        for i in range(2 * FPS):
            frame = np.full((HEIGHT, WIDTH, 3), 235, dtype=np.uint8)
            x = int(40 + (i / (2 * FPS)) * 400)
            cv2.rectangle(frame, (x, 150), (x + 26, 226), (240, 240, 240), -1)
            writer.write(frame)
        writer.release()
        result = analyse_video(path, MotionDetector(), frame_stride=3)
        assert result.tracks == []
        # It found nothing, and it says what it is rather than claiming a
        # clean sheet.
        assert "cannot tell a player" in " ".join(result.notes)

    @needs_ffmpeg
    def test_follows_each_skater_rather_than_re_finding_them(
        self, tmp_path: Path
    ) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        result = analyse_video(source, MotionDetector(), frame_stride=3)
        longest = max(len(t.observations) for t in result.tracks)
        # A tracker that failed to associate would return dozens of one-frame
        # tracks instead of a few long ones.
        assert longest >= 10

    @needs_ffmpeg
    def test_says_out_loud_that_no_numbers_were_read(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        result = analyse_video(source, MotionDetector(), frame_stride=6)
        notes = " ".join(result.notes)
        assert "jersey-number reader" in notes
        assert "confirmed" in notes
        for track in result.tracks:
            for observation in track.observations:
                assert observation.jersey_number is None
                assert observation.jersey_number_score == 0.0

    @needs_ffmpeg
    def test_reports_which_detector_produced_the_result(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        result = analyse_video(source, MotionDetector(), frame_stride=6)
        assert result.detection_source == "opencv:mog2-motion+bytetrack"
        assert "cannot tell a player from a referee" in " ".join(result.notes)

    @needs_ffmpeg
    def test_produces_the_wire_shape_the_engine_expects(self, tmp_path: Path) -> None:
        source = write_rink_video(tmp_path / "game.mp4")
        payload = analyse_video(source, MotionDetector(), frame_stride=6).as_dict()
        assert set(payload) >= {
            "tracks", "detection_source", "frames_analysed",
            "frame_width", "frame_height", "used_reference_photo", "notes",
        }
        observation = payload["tracks"][0]["observations"][0]  # type: ignore[index]
        assert set(observation) == {
            "frame", "time_seconds", "box", "detection_score",
            "jersey_color_id", "jersey_color_score",
            "jersey_number", "jersey_number_score",
        }
        assert set(observation["box"]) == {"x", "y", "width", "height"}

    @needs_ffmpeg
    def test_attaches_number_reads_per_observation(self, tmp_path: Path) -> None:
        # Per-observation, not per-track: a number is readable in some frames
        # and not others, and the engine weights by legibility.
        source = write_rink_video(tmp_path / "game.mp4")
        reader = ScriptedNumberReader([NumberRead("17", 0.9)] * 200)
        result = analyse_video(
            source, MotionDetector(), reader=reader, frame_stride=6
        )
        reads = [
            o.jersey_number
            for t in result.tracks
            for o in t.observations
            if o.jersey_number is not None
        ]
        assert reads and all(r == "17" for r in reads)

    def test_a_missing_model_fails_loudly_instead_of_returning_nothing(
        self, tmp_path: Path
    ) -> None:
        """The failure the evidence audit named.

        Zero tracks reported as success reads to a user as "the analysis ran
        and your child did nothing all game". It must raise.
        """
        detector = YoloDetector(weights="/nonexistent/weights.pt")
        if detector.available().ready:
            pytest.skip("ultralytics is installed, so this cannot be exercised")
        source = tmp_path / "game.mp4"
        source.write_bytes(b"")
        with pytest.raises(DetectorUnavailable):
            analyse_video(source, detector)

    @needs_ffmpeg
    def test_an_unopenable_video_fails_rather_than_reporting_an_empty_game(
        self, tmp_path: Path
    ) -> None:
        broken = tmp_path / "broken.mp4"
        broken.write_text("not a video", encoding="utf8")
        with pytest.raises(DetectorUnavailable):
            analyse_video(broken, ScriptedDetector([[Detection(Box(0, 0, 10, 10), 0.9)]]))


class TestSelectDetector:
    def test_names_the_two_real_choices(self) -> None:
        assert select_detector("motion").id == "opencv:mog2-motion"
        assert select_detector("yolo").id.startswith("ultralytics:")

    def test_refuses_an_unknown_detector_rather_than_picking_one(self) -> None:
        # No silent fallback: which detector ran changes what the results mean.
        with pytest.raises(ValueError, match="Unknown detector"):
            select_detector("magic")


class TestServiceSafety:
    def test_keeps_storage_keys_inside_the_media_root(self, tmp_path: Path) -> None:
        root = (tmp_path / "media").resolve()
        root.mkdir()
        assert resolve_key(root, "originals/game.mp4") == root / "originals/game.mp4"
        for hostile in ("../../etc/passwd", "/etc/passwd", ""):
            with pytest.raises(UnsafeKey):
                resolve_key(root, hostile)

    def test_availability_says_which_half_is_missing(self, tmp_path: Path) -> None:
        settings = Settings(media_root=tmp_path / "media")
        service = Service(settings, detector=MotionDetector())
        status = service.availability()
        assert set(status) >= {"ready", "detail", "remedy", "detector"}
        if ffmpeg_available():
            assert status["ready"] is True
        else:
            assert status["ready"] is False
            assert "ffmpeg" in str(status["remedy"])

    @needs_ffmpeg
    def test_refuses_a_traversing_key_through_the_endpoint(self, tmp_path: Path) -> None:
        service = Service(Settings(media_root=tmp_path / "media"), detector=MotionDetector())
        with pytest.raises(UnsafeKey):
            service.probe({"storage_key": "../../../etc/passwd"})

    @needs_ffmpeg
    def test_runs_probe_and_proxy_through_the_service_layer(self, tmp_path: Path) -> None:
        root = tmp_path / "media"
        settings = Settings(media_root=root)
        service = Service(settings, detector=MotionDetector())
        write_rink_video(root / "originals" / "game.mp4")
        measured = service.probe({"storage_key": "originals/game.mp4"})
        assert measured["width"] == WIDTH
        proxied = service.proxy({"storage_key": "originals/game.mp4", "max_height": 180})
        assert proxied["storage_key"].startswith("proxies/")
        assert (root / proxied["storage_key"]).exists()

    @needs_ffmpeg
    def test_says_a_reference_photo_was_not_used(self, tmp_path: Path) -> None:
        root = tmp_path / "media"
        service = Service(Settings(media_root=root), detector=MotionDetector())
        write_rink_video(root / "originals" / "game.mp4", seconds=2)
        result = service.track({
            "storage_key": "originals/game.mp4",
            "frame_stride": 10,
            "reference_photo_key": "photos/sam.jpg",
        })
        assert any("was not used" in note for note in result["notes"])  # type: ignore[union-attr]
        assert result["used_reference_photo"] is False
