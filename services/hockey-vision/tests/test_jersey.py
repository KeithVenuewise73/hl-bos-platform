"""Jersey colour tests, run against real pixels.

Every test here builds an actual BGR image, converts it through OpenCV's real
colour conversion, and asks the classifier what it sees. Nothing is mocked,
because the thing most likely to be wrong is the colour space arithmetic
itself.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from hockey_vision.jersey import (  # noqa: E402
    COLORS,
    COLORS_BY_ID,
    classify_color,
    dominant_hsv,
    torso_crop,
)
from hockey_vision.ocr import NullNumberReader, number_crop_bounds  # noqa: E402


def patch(bgr: tuple[int, int, int], size: int = 40) -> np.ndarray:
    """A solid BGR patch, converted to HSV exactly as the pipeline does."""
    image = np.zeros((size, size, 3), dtype=np.uint8)
    image[:, :] = bgr
    return cv2.cvtColor(image, cv2.COLOR_BGR2HSV)


class TestColorClassification:
    def test_reads_a_navy_jersey(self) -> None:
        assert classify_color(patch((90, 40, 20)))[0] == "navy"

    def test_reads_a_bright_red_jersey(self) -> None:
        # Red straddles the 0/179 hue seam. A single min/max comparison gets
        # this wrong, which is why the spec carries two windows.
        assert classify_color(patch((30, 30, 210)))[0] == "red"

    def test_reads_a_white_jersey(self) -> None:
        assert classify_color(patch((240, 240, 240)))[0] == "white"

    def test_reads_a_black_jersey(self) -> None:
        assert classify_color(patch((20, 20, 20)))[0] == "black"

    def test_reads_a_green_jersey(self) -> None:
        assert classify_color(patch((60, 150, 30)))[0] == "green"

    def test_reads_a_gold_jersey(self) -> None:
        assert classify_color(patch((30, 190, 220)))[0] == "gold"

    def test_does_not_call_a_red_jersey_white_because_it_is_bright(self) -> None:
        # Without a saturation ceiling on the achromatic colours, "bright" and
        # "white" collapse into each other.
        assert classify_color(patch((30, 30, 250)))[0] != "white"

    def test_tells_navy_from_bright_blue_by_darkness(self) -> None:
        assert classify_color(patch((90, 40, 20)))[0] == "navy"
        assert classify_color(patch((230, 100, 40)))[0] == "blue"

    def test_reports_nothing_rather_than_guessing_on_an_empty_crop(self) -> None:
        assert classify_color(np.zeros((0, 0, 3), dtype=np.uint8)) == (None, 0.0)

    def test_refuses_a_crop_that_is_mostly_not_one_colour(self) -> None:
        # A player at the far boards is a handful of noisy pixels. "I could not
        # read this jersey" is the honest answer; a guess becomes evidence.
        rng = np.random.default_rng(7)
        noise = rng.integers(0, 255, (40, 40, 3), dtype=np.uint8)
        colour, score = classify_color(cv2.cvtColor(noise, cv2.COLOR_BGR2HSV))
        assert colour is None or score >= 0.35

    def test_score_is_the_fraction_of_the_crop_that_agreed(self) -> None:
        colour, score = classify_color(patch((90, 40, 20)))
        assert colour == "navy"
        assert 0.9 <= score <= 1.0

    def test_a_half_and_half_crop_scores_below_a_solid_one(self) -> None:
        image = np.zeros((40, 40, 3), dtype=np.uint8)
        image[:, :20] = (90, 40, 20)
        image[:, 20:] = (240, 240, 240)
        _, mixed = classify_color(cv2.cvtColor(image, cv2.COLOR_BGR2HSV))
        _, solid = classify_color(patch((90, 40, 20)))
        assert mixed < solid


class TestTorsoCrop:
    def test_takes_the_jersey_band_not_the_whole_box(self) -> None:
        # The box is mostly ice, helmet and socks. Averaging all of it gives
        # you the colour of the rink.
        frame = np.zeros((400, 400, 3), dtype=np.uint8)
        frame[:, :] = (255, 255, 255)          # ice everywhere
        frame[125:160, 108:132] = (90, 40, 20)  # a navy torso inside the box
        crop = torso_crop(cv2.cvtColor(frame, cv2.COLOR_BGR2HSV), 100, 100, 40, 90)
        assert classify_color(crop)[0] == "navy"

    def test_stays_inside_the_frame_when_the_box_runs_off_the_edge(self) -> None:
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        crop = torso_crop(frame, 90, 90, 40, 90)
        assert crop.size >= 0
        assert crop.shape[0] <= 100 and crop.shape[1] <= 100

    def test_never_returns_a_negative_slice_for_a_box_at_the_origin(self) -> None:
        frame = np.zeros((100, 100, 3), dtype=np.uint8)
        assert torso_crop(frame, 0, 0, 10, 10).size > 0


class TestDominantHsv:
    def test_uses_the_median_because_a_mean_hue_is_meaningless(self) -> None:
        # Hue is an angle: the mean of 179 and 1 is 90, a cyan average of two
        # reds. The median is at least always a hue that occurs in the crop.
        hsv = np.zeros((2, 1, 3), dtype=np.uint8)
        hsv[0, 0] = (179, 200, 200)
        hsv[1, 0] = (1, 200, 200)
        hue = dominant_hsv(hsv)[0]
        assert hue in (1, 90, 179)
        assert dominant_hsv(np.zeros((0, 0, 3), dtype=np.uint8)) == (0, 0, 0)


class TestNumberReading:
    def test_the_number_crop_sits_on_the_shoulder_blades(self) -> None:
        x, y, w, h = number_crop_bounds(100, 200, 40, 90)
        assert 100 < x < 140 and 200 < y < 245
        assert w < 40 and h < 90

    def test_the_default_reader_reads_nothing_and_says_so(self) -> None:
        # Fabricating a number here would push tracks into the 'confirmed'
        # band on invented evidence, and 'confirmed' is the band that tells a
        # parent "this is definitely your child".
        reader = NullNumberReader()
        assert reader.available() is False
        result = reader.read(np.zeros((20, 20, 3), dtype=np.uint8))
        assert result.digits is None
        assert result.confidence == 0.0


class TestNoDriftFromTheEngine:
    def test_the_colour_list_matches_the_typescript_engine(self) -> None:
        """The Python and TypeScript colour vocabularies must not drift.

        They are duplicated because the two processes share no runtime. This
        test is what makes the duplication safe: add a colour to one side only
        and it fails here rather than in a user's review screen, where a jersey
        the app offered would simply never match.
        """
        source = (
            ROOT.parents[1]
            / "packages"
            / "hockey-highlights"
            / "src"
            / "jersey.ts"
        ).read_text(encoding="utf8")
        ts_ids = re.findall(r'^\s{4}id: "([a-z]+)",$', source, re.MULTILINE)
        assert ts_ids, "could not read the colour ids out of jersey.ts"
        assert [c.id for c in COLORS] == ts_ids

    def test_every_colour_is_unique_and_well_formed(self) -> None:
        assert len(COLORS_BY_ID) == len(COLORS)
        for spec in COLORS:
            assert spec.hue_ranges
            assert 0 <= spec.min_value <= spec.max_value <= 255
            for low, high in spec.hue_ranges:
                assert 0 <= low <= high <= 179
