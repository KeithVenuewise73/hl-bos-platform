"""Colour science.

These assertions are the SAME ones the TypeScript suite makes, deliberately.
The two implementations exist for performance reasons and must not drift; if one
of these fails and its TypeScript twin passes, the drift has happened.
"""

import unittest

from highlight_cv.color import (
    COLOR_REFERENCE,
    assign_team,
    chroma,
    classify_jersey_color,
    rgb_to_hsv,
    rgb_to_lab,
    uniform_distance,
)


def expose(rgb, stops):
    """Change exposure the way a camera does: all channels together."""
    return tuple(max(0, min(255, round(c + stops))) for c in rgb)


class TestConversions(unittest.TestCase):
    def test_hue_of_primaries(self):
        self.assertAlmostEqual(rgb_to_hsv((255, 0, 0))[0], 0, places=5)
        self.assertAlmostEqual(rgb_to_hsv((0, 255, 0))[0], 120, places=5)
        self.assertAlmostEqual(rgb_to_hsv((0, 0, 255))[0], 240, places=5)

    def test_grey_has_no_saturation(self):
        self.assertEqual(rgb_to_hsv((128, 128, 128))[1], 0)

    def test_white_is_light_and_neutral_in_lab(self):
        lightness, a, b = rgb_to_lab(COLOR_REFERENCE["white"])
        self.assertGreater(lightness, 90)
        self.assertLess(abs(a), 3)
        self.assertLess(abs(b), 5)

    def test_chroma_separates_colourful_from_neutral(self):
        self.assertGreater(chroma(rgb_to_lab(COLOR_REFERENCE["red"])), 40)
        self.assertLess(chroma(rgb_to_lab(COLOR_REFERENCE["gray"])), 18)


class TestLightingTolerance(unittest.TestCase):
    def test_blue_survives_a_two_stop_exposure_swing(self):
        blue = COLOR_REFERENCE["blue"]
        self.assertLess(uniform_distance(blue, expose(blue, -55)), 18)
        self.assertLess(uniform_distance(blue, expose(blue, 45)), 18)

    def test_blue_and_red_stay_apart_at_night(self):
        self.assertGreater(
            uniform_distance(expose(COLOR_REFERENCE["blue"], -55), expose(COLOR_REFERENCE["red"], -55)),
            40,
        )

    def test_white_does_not_collapse_into_black(self):
        # The trap: down-weighting lightness for lighting tolerance would make
        # every achromatic uniform identical.
        self.assertGreater(uniform_distance(COLOR_REFERENCE["white"], COLOR_REFERENCE["black"]), 60)
        self.assertGreater(uniform_distance(COLOR_REFERENCE["white"], COLOR_REFERENCE["gray"]), 25)


class TestClassification(unittest.TestCase):
    def test_reference_colours_name_themselves(self):
        for name in ("blue", "white", "red", "black", "gold", "purple", "orange"):
            self.assertEqual(classify_jersey_color(COLOR_REFERENCE[name])[0], name)

    def test_distribution_sums_to_one_and_is_sorted(self):
        _, _, dist = classify_jersey_color(COLOR_REFERENCE["navy"])
        self.assertAlmostEqual(sum(c for _, c in dist), 1.0, places=6)
        self.assertEqual(dist, sorted(dist, key=lambda x: -x[1]))

    def test_ambiguous_colour_is_less_confident_than_a_clean_one(self):
        navy, royal = COLOR_REFERENCE["navy"], COLOR_REFERENCE["royal_blue"]
        between = tuple(round((a + b) / 2) for a, b in zip(navy, royal))
        self.assertLess(
            classify_jersey_color(between)[1], classify_jersey_color(COLOR_REFERENCE["red"])[1]
        )


class TestTeamAssignment(unittest.TestCase):
    TEAMS = [("team_a", COLOR_REFERENCE["blue"]), ("team_b", COLOR_REFERENCE["white"])]

    def test_assigns_a_clean_jersey(self):
        team, confidence = assign_team(COLOR_REFERENCE["blue"], self.TEAMS)
        self.assertEqual(team, "team_a")
        self.assertGreater(confidence, 0.9)

    def test_assigns_correctly_under_night_lighting(self):
        self.assertEqual(assign_team(expose(COLOR_REFERENCE["blue"], -50), self.TEAMS)[0], "team_a")

    def test_refuses_rather_than_guessing_on_a_referee(self):
        team, _ = assign_team(
            (140, 140, 60),
            [("team_a", COLOR_REFERENCE["navy"]), ("team_b", COLOR_REFERENCE["maroon"])],
        )
        self.assertIsNone(team)

    def test_no_teams_means_no_assignment(self):
        self.assertEqual(assign_team(COLOR_REFERENCE["blue"], []), (None, 0.0))


if __name__ == "__main__":
    unittest.main()
