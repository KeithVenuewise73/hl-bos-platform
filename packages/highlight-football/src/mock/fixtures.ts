/**
 * Named test fixtures (brief section 43).
 *
 * Each of these is a specific way football film breaks a tracker, expressed as
 * a scenario the real engine has to survive. They exist so that a change to the
 * engine has to state which of these failures it is willing to reintroduce.
 *
 * The brief asks for exactly these seven. They are not variations on a theme:
 * "occluded" and "number invisible" fail the system in different places, and a
 * fix for one routinely breaks the other.
 */

import type {
  SyntheticGame,
  SyntheticGameOptions,
  SyntheticPlaySpec,
} from "./synthetic";
import { buildSyntheticGame } from "./synthetic";
import { COLOR_REFERENCE } from "../color";

const basePlay: SyntheticPlaySpec = {
  deadSeconds: 4,
  liveSeconds: 5.5,
  athleteOnField: true,
  athleteEvent: null,
  athleteEventConfidence: 0.8,
  athleteHasBall: false,
  cameraPan: false,
  occlusionSeconds: null,
  numberInvisibleSeconds: null,
  leavesFrame: false,
};

const play = (over: Partial<SyntheticPlaySpec>): SyntheticPlaySpec => ({
  ...basePlay,
  ...over,
});

export const FIXTURE_NAMES = [
  "blue_23_vs_white",
  "white_7_vs_dark",
  "confusable_teammates",
  "occluded_player",
  "number_invisible",
  "camera_pan",
  "leaves_and_reenters",
] as const;

export type FixtureName = (typeof FIXTURE_NAMES)[number];

export const FIXTURE_DESCRIPTIONS: Readonly<Record<FixtureName, string>> = {
  blue_23_vs_white:
    "Blue #23 against a white opponent. The baseline case everything else is measured against.",
  white_7_vs_dark:
    "White #7 against a dark opponent, under night-game lighting. Inverts the colour problem.",
  confusable_teammates:
    "#23 and #28 on the same team. The number is the only thing separating them, and it is the thing OCR gets wrong.",
  occluded_player:
    "The athlete disappears into a pile mid-play and the tracker splits him in two.",
  number_invisible:
    "The number cannot be read for several seconds. Tests that identity survives on the vote, not the frame.",
  camera_pan:
    "The operator pans hard during the play, and again during dead time. The dead-time pan must not become a play.",
  leaves_and_reenters:
    "The athlete runs out of frame and comes back. His track ends and a new one starts.",
};

const FIXTURE_OPTIONS: Readonly<Record<FixtureName, SyntheticGameOptions>> = {
  blue_23_vs_white: {
    seed: 11,
    targetNumber: 23,
    plays: [
      play({ athleteEvent: "tackle", athleteEventConfidence: 0.86 }),
      play({ athleteOnField: false }),
      play({
        athleteHasBall: true,
        athleteEvent: "catch",
        athleteEventConfidence: 0.91,
      }),
      play({}),
      play({
        athleteHasBall: true,
        athleteEvent: "touchdown",
        athleteEventConfidence: 0.88,
      }),
    ],
  },

  white_7_vs_dark: {
    seed: 22,
    targetNumber: 7,
    teamAJersey: COLOR_REFERENCE.white,
    teamBJersey: COLOR_REFERENCE.navy,
    // Night game: the whole frame is two stops down. This is the case that
    // breaks naive RGB matching, which is why the fixture exists.
    lightingOffset: -46,
    plays: [
      play({ athleteEvent: "interception", athleteEventConfidence: 0.84 }),
      play({}),
      play({ athleteEvent: "pass_breakup", athleteEventConfidence: 0.79 }),
    ],
  },

  confusable_teammates: {
    seed: 33,
    targetNumber: 23,
    confusableTeammateNumber: 28,
    plays: [
      play({ athleteEvent: "tackle", athleteEventConfidence: 0.83 }),
      play({ athleteHasBall: true, athleteEvent: "run", athleteEventConfidence: 0.87 }),
      play({}),
    ],
  },

  occluded_player: {
    seed: 44,
    targetNumber: 23,
    plays: [
      play({
        occlusionSeconds: [1.6, 3.0],
        athleteEvent: "tackle",
        athleteEventConfidence: 0.81,
      }),
      play({ occlusionSeconds: [0.8, 2.4] }),
      play({
        athleteHasBall: true,
        athleteEvent: "catch",
        athleteEventConfidence: 0.9,
      }),
    ],
  },

  number_invisible: {
    seed: 55,
    targetNumber: 23,
    // Facing away from the camera for most of the game.
    numberReadability: 0.14,
    plays: [
      play({
        numberInvisibleSeconds: [0.5, 4.5],
        athleteEvent: "tackle",
        athleteEventConfidence: 0.8,
      }),
      play({ numberInvisibleSeconds: [0, 3.2] }),
      play({ athleteHasBall: true, athleteEvent: "run", athleteEventConfidence: 0.85 }),
    ],
  },

  camera_pan: {
    seed: 66,
    targetNumber: 23,
    // A pan in the dead time before play index 1. It produces more raw motion
    // than some real plays, and must still not be segmented as football.
    deadTimePanBeforePlay: 1,
    plays: [
      play({ cameraPan: true, athleteEvent: "tackle", athleteEventConfidence: 0.82 }),
      play({
        cameraPan: true,
        athleteHasBall: true,
        athleteEvent: "return",
        athleteEventConfidence: 0.86,
      }),
      play({}),
    ],
  },

  leaves_and_reenters: {
    seed: 77,
    targetNumber: 23,
    plays: [
      play({ leavesFrame: true, athleteEvent: "run", athleteEventConfidence: 0.84 }),
      play({ leavesFrame: true }),
      play({
        athleteHasBall: true,
        athleteEvent: "touchdown",
        athleteEventConfidence: 0.89,
      }),
    ],
  },
};

export function fixture(name: FixtureName): SyntheticGame {
  return buildSyntheticGame(FIXTURE_OPTIONS[name]);
}

/**
 * The demo game the product ships with: long enough to look like a game,
 * short enough to process in a demo, and containing every failure above at
 * least once so the demo shows the system recovering rather than the system
 * being lucky.
 */
export function demoGame(): SyntheticGame {
  return buildSyntheticGame({
    seed: 20260911,
    targetNumber: 23,
    targetName: "Dominic Herman",
    confusableTeammateNumber: 28,
    deadTimePanBeforePlay: 3,
    plays: [
      play({ athleteEvent: "tackle", athleteEventConfidence: 0.86 }),
      play({ athleteOnField: false }),
      play({
        occlusionSeconds: [1.4, 2.6],
        athleteEvent: "run_stop",
        athleteEventConfidence: 0.78,
      }),
      play({
        cameraPan: true,
        athleteHasBall: true,
        athleteEvent: "catch",
        athleteEventConfidence: 0.9,
      }),
      play({
        numberInvisibleSeconds: [0.4, 4.2],
        athleteEvent: "pass_breakup",
        athleteEventConfidence: 0.81,
      }),
      play({}),
      play({ leavesFrame: true, athleteEvent: "tackle", athleteEventConfidence: 0.77 }),
      play({
        athleteHasBall: true,
        athleteEvent: "interception",
        athleteEventConfidence: 0.88,
      }),
      play({ athleteOnField: false }),
      play({
        athleteHasBall: true,
        athleteEvent: "touchdown",
        athleteEventConfidence: 0.92,
      }),
    ],
  });
}
