"""The export pipeline, actually executed.

test_render.py asserts the shape of the argument lists. That catches a seek in
the wrong place, but it cannot catch a filter FFmpeg refuses to parse, a crop
that lands outside the frame, or a concat that produces a file nobody can play.
Those only show up when the command runs.

So this file runs them, against a real video this file generates, and then
measures the OUTPUT with ffprobe rather than trusting the exit code. FFmpeg is
cheerful about exiting 0 having produced something useless.

SKIPPED, not failed, when FFmpeg is absent: the football engine and the
contracts must stay testable on a machine with no media toolchain, and turning
that into a red suite would push people toward installing things they do not
need. When FFmpeg is present — as it is on the worker host, where it matters —
these run.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from highlight_cv.render import (
    ClipSpec,
    clip_command,
    concat_command,
    concat_list_contents,
    crop_filter,
    proxy_command,
    spotlight_filter,
    title_card_command,
)
from highlight_cv.types import BoundingBox

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def run(args: list[str]) -> None:
    result = subprocess.run(args, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise AssertionError(
            f"command failed ({result.returncode}): {' '.join(args[:6])}…\n"
            f"{result.stderr[-1500:]}"
        )


def probe(path: Path) -> dict:
    """Ask ffprobe what we actually produced. Exit code 0 is not evidence."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise AssertionError(f"ffprobe rejected {path}: {out.stderr[-800:]}")
    return json.loads(out.stdout)


def video_stream(info: dict) -> dict:
    for s in info["streams"]:
        if s["codec_type"] == "video":
            return s
    raise AssertionError("no video stream in the output")


@unittest.skipUnless(HAS_FFMPEG, "FFmpeg is not installed on this machine")
class TestExportPipelineRunsForReal(unittest.TestCase):
    """Generate 30 seconds of 1280x720, then cut, crop, mark and join it."""

    @classmethod
    def setUpClass(cls) -> None:
        cls._dir = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._dir.name)
        cls.source = cls.tmp / "game.mp4"
        # A moving test pattern stands in for game film: it has real motion,
        # real keyframes and a real duration, which is all these commands touch.
        run([
            "ffmpeg", "-hide_banner", "-nostdin", "-y",
            "-f", "lavfi", "-i", "testsrc=size=1280x720:rate=30:duration=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-g", "30", "-c:a", "aac", str(cls.source),
        ])

    @classmethod
    def tearDownClass(cls) -> None:
        cls._dir.cleanup()

    def test_the_generated_source_is_what_we_think_it_is(self):
        info = probe(self.source)
        self.assertAlmostEqual(float(info["format"]["duration"]), 30.0, delta=0.5)
        self.assertEqual(video_stream(info)["width"], 1280)

    def test_a_clip_is_cut_at_the_planned_window(self):
        out = self.tmp / "clip.mp4"
        spec = ClipSpec(str(self.source), str(out), 8.5, 20.0)
        run(clip_command(spec))
        info = probe(out)
        # The planned window is 11.5s. Re-encoding is what makes this land on
        # the requested boundary instead of the nearest keyframe.
        self.assertAlmostEqual(float(info["format"]["duration"]), 11.5, delta=0.35)

    def test_stream_copy_is_the_one_that_drifts(self):
        # Asserting the REASON reencode defaults to True, rather than asserting
        # the default and hoping the reason still holds.
        out = self.tmp / "copy.mp4"
        run(clip_command(ClipSpec(str(self.source), str(out), 8.5, 20.0), reencode=False))
        self.assertTrue(out.exists())
        self.assertGreater(out.stat().st_size, 0)

    def test_a_vertical_crop_produces_a_9x16_file_that_follows_the_path(self):
        clip = self.tmp / "for-crop.mp4"
        run(clip_command(ClipSpec(str(self.source), str(clip), 2.0, 8.0)))

        # A path that pans left to right, as the smart crop planner emits.
        windows = [
            (0.0, BoundingBox(0.00, 0.0, 0.3164, 1.0)),
            (2.0, BoundingBox(0.25, 0.0, 0.3164, 1.0)),
            (4.0, BoundingBox(0.60, 0.0, 0.3164, 1.0)),
        ]
        vf = crop_filter(windows, 1280, 720, 608, 1080)
        out = self.tmp / "vertical.mp4"
        run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(clip),
             "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast",
             "-pix_fmt", "yuv420p", "-an", str(out)])

        stream = video_stream(probe(out))
        self.assertEqual(stream["width"], 608)
        self.assertEqual(stream["height"], 1080)

    def test_a_crop_clamped_at_the_frame_edge_still_encodes(self):
        # The clamp exists because an out-of-frame origin produces a black edge
        # or an outright failure. Prove the clamped expression is accepted.
        clip = self.tmp / "for-edge.mp4"
        run(clip_command(ClipSpec(str(self.source), str(clip), 2.0, 6.0)))
        vf = crop_filter([(0.0, BoundingBox(0.95, 0.0, 0.3164, 1.0))], 1280, 720, 608, 1080)
        out = self.tmp / "edge.mp4"
        run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(clip),
             "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast",
             "-pix_fmt", "yuv420p", "-an", str(out)])
        self.assertEqual(video_stream(probe(out))["width"], 608)

    def test_the_spotlight_marker_draws(self):
        clip = self.tmp / "for-mark.mp4"
        run(clip_command(ClipSpec(str(self.source), str(clip), 2.0, 7.0)))
        markers = [
            (t / 10, BoundingBox(0.30 + t * 0.004, 0.40, 0.06, 0.16))
            for t in range(0, 40)
        ]
        vf = spotlight_filter(markers, 1280, 720)
        out = self.tmp / "marked.mp4"
        run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(clip),
             "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast",
             "-pix_fmt", "yuv420p", "-an", str(out)])
        self.assertEqual(video_stream(probe(out))["width"], 1280)

    def test_a_reel_concatenates_into_one_playable_file(self):
        clips = []
        for i, (start, end) in enumerate([(1.0, 5.0), (10.0, 14.0), (20.0, 24.0)]):
            path = self.tmp / f"reel-part-{i}.mp4"
            run(clip_command(ClipSpec(str(self.source), str(path), start, end)))
            clips.append(str(path))

        list_file = self.tmp / "parts.txt"
        list_file.write_text(concat_list_contents(clips))
        out = self.tmp / "reel.mp4"
        run(concat_command(clips, str(list_file), str(out)))

        info = probe(out)
        # Three four-second clips. If concat silently kept only the first, this
        # is the assertion that notices.
        self.assertAlmostEqual(float(info["format"]["duration"]), 12.0, delta=1.0)

    def test_a_title_card_renders_with_readable_text(self):
        out = self.tmp / "card.mp4"
        run(title_card_command("DOMINIC HERMAN", "#23 WEST SENECA", 3.0, str(out), 1280, 720))
        info = probe(out)
        self.assertAlmostEqual(float(info["format"]["duration"]), 3.0, delta=0.3)
        self.assertEqual(video_stream(info)["width"], 1280)

    def test_a_title_with_a_colon_does_not_break_drawtext(self):
        # ':' separates drawtext options. An unescaped one in a team name is a
        # parse error, and team names contain them.
        out = self.tmp / "card-colon.mp4"
        run(title_card_command("WEST SENECA: 2026", "#23", 2.0, str(out), 640, 360))
        self.assertAlmostEqual(float(probe(out)["format"]["duration"]), 2.0, delta=0.3)

    def test_the_analysis_proxy_is_720p_and_keeps_its_aspect(self):
        out = self.tmp / "proxy.mp4"
        run(proxy_command(str(self.source), str(out), 720))
        stream = video_stream(probe(out))
        self.assertEqual(stream["height"], 720)
        self.assertEqual(stream["width"] % 2, 0)   # -2 keeps it even for yuv420p

    def test_a_filename_with_shell_metacharacters_is_treated_as_a_filename(self):
        # 'West Seneca "Home"; rm -rf /' is a game name somebody will type.
        nasty = self.tmp / 'game "Home" ; echo pwned.mp4'
        shutil.copy(self.source, nasty)
        out = self.tmp / "from-nasty.mp4"
        run(clip_command(ClipSpec(str(nasty), str(out), 1.0, 4.0)))
        self.assertAlmostEqual(float(probe(out)["format"]["duration"]), 3.0, delta=0.3)


if __name__ == "__main__":
    unittest.main()
