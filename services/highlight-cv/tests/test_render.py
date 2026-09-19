"""FFmpeg command construction.

Every mistake that ruins an export is visible in an argument list, and none of
these tests need FFmpeg installed.
"""

import unittest

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


class TestClipCommand(unittest.TestCase):
    SPEC = ClipSpec("/film/game.mp4", "/out/clip1.mp4", 471.667, 492.0)

    def test_seeks_before_the_input(self):
        # -ss AFTER -i decodes from zero: two seconds versus four minutes on a
        # two-hour file.
        args = clip_command(self.SPEC)
        self.assertLess(args.index("-ss"), args.index("-i"))

    def test_uses_the_planned_window_exactly(self):
        args = clip_command(self.SPEC)
        self.assertEqual(args[args.index("-ss") + 1], "471.667")
        self.assertEqual(args[args.index("-t") + 1], "20.333")

    def test_re_encodes_by_default(self):
        # Stream copy snaps the start to a keyframe, which would silently move
        # the 5-second pre-snap lead-in.
        self.assertIn("libx264", clip_command(self.SPEC))
        self.assertIn("-c", clip_command(self.SPEC, reencode=False))

    def test_refuses_a_zero_length_clip(self):
        with self.assertRaises(ValueError):
            clip_command(ClipSpec("/a.mp4", "/b.mp4", 10.0, 10.0))

    def test_passes_arguments_as_a_list_not_a_shell_string(self):
        # A game called 'West Seneca "Home" ; rm -rf /' is a filename.
        args = clip_command(ClipSpec('/film/a "b" ; rm -rf x.mp4', "/out/c.mp4", 0, 5))
        self.assertIn('/film/a "b" ; rm -rf x.mp4', args)


class TestCropFilter(unittest.TestCase):
    WINDOWS = [
        (0.0, BoundingBox(0.0, 0.0, 0.3164, 1.0)),
        (1.0, BoundingBox(0.2, 0.0, 0.3164, 1.0)),
        (2.0, BoundingBox(0.6, 0.0, 0.3164, 1.0)),
    ]

    def test_builds_a_time_varying_crop(self):
        f = crop_filter(self.WINDOWS, 1920, 1080, 1080, 1920)
        self.assertIn("crop=", f)
        self.assertIn("scale=1080:1920", f)
        self.assertEqual(f.count("if(gte(t,"), 6)  # three keyframes, two axes

    def test_clamps_the_window_inside_the_frame(self):
        # A window that drifts a pixel outside produces a black edge.
        out_of_frame = [(0.0, BoundingBox(0.95, 0.0, 0.3164, 1.0))]
        f = crop_filter(out_of_frame, 1920, 1080, 1080, 1920)
        crop_width = int(round(0.3164 * 1920))
        self.assertIn(f"{float(1920 - crop_width):.2f}", f)

    def test_refuses_an_empty_path(self):
        with self.assertRaises(ValueError):
            crop_filter([], 1920, 1080, 1080, 1920)


class TestSpotlightFilter(unittest.TestCase):
    def test_draws_an_outline_not_a_fill(self):
        # The brief's constraint: do not obscure the play.
        f = spotlight_filter([(1.0, BoundingBox(0.4, 0.4, 0.06, 0.14))], 1920, 1080)
        self.assertIn("drawbox=", f)
        self.assertIn("t=3", f)
        self.assertNotIn("t=fill", f)

    def test_gates_each_box_to_its_own_moment(self):
        f = spotlight_filter(
            [(1.0, BoundingBox(0.4, 0.4, 0.06, 0.14)), (1.5, BoundingBox(0.45, 0.4, 0.06, 0.14))],
            1920, 1080,
        )
        self.assertEqual(f.count("enable='between(t,"), 2)

    def test_no_markers_is_a_pass_through_not_a_crash(self):
        self.assertEqual(spotlight_filter([], 1920, 1080), "null")


class TestReelAssembly(unittest.TestCase):
    def test_concatenates_by_stream_copy(self):
        args = concat_command(["/a.mp4", "/b.mp4"], "/list.txt", "/reel.mp4")
        self.assertIn("concat", args)
        self.assertIn("copy", args)
        self.assertIn("+faststart", args)

    def test_refuses_an_empty_reel(self):
        with self.assertRaises(ValueError):
            concat_command([], "/list.txt", "/reel.mp4")

    def test_escapes_quotes_in_the_concat_list(self):
        contents = concat_list_contents(["/film/o'brien.mp4"])
        self.assertIn("o'\\''brien", contents)

    def test_proxy_is_downscaled_for_analysis(self):
        args = proxy_command("/film/game.mp4", "/proxy/game.mp4")
        self.assertIn("scale=-2:720", args)

    def test_title_card_needs_a_duration(self):
        with self.assertRaises(ValueError):
            title_card_command("A", "B", 0, "/out.mp4")

    def test_title_card_escapes_drawtext_metacharacters(self):
        args = title_card_command("WEST SENECA: 2026", "#23", 3, "/out.mp4")
        self.assertIn(r"WEST SENECA\: 2026", " ".join(args))


if __name__ == "__main__":
    unittest.main()
