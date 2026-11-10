# @hl-bos/game-cut

Two whole-game camera recordings in, **one video of the game** out.

Built for hockey filmed by two phones on the glass, one behind each goalie, each
looking down the ice from its own end. The result is a **broadcast**: the picture
follows the play, showing whichever end of the ice the action is at, as if one
camera operator were switching between them.

## What it does

1. **Lines the two videos up** by the sound they share (whistles, horns, the
   crowd). The phones were not started at the same instant; this finds the
   difference to a fraction of a second. It checks the files' own start times
   first, then corrects them.
2. **Reads the action** in each video from loudness and from how much the picture
   changes.
3. **Chooses a camera for every moment.** The camera whose end of the ice is busier
   is on screen. A camera is held for at least 4 seconds, so the picture does not
   jump back and forth. Through a short quiet spell it stays where it was.
4. **Leaves out dead time:** a quiet stretch of 90 seconds or more (an intermission,
   the time before the game) is cut.
5. **Cuts and joins** the pieces in game order, and writes a list of every piece and
   which camera it came from, so a person can check the choices.

A second mode, `highlights`, keeps only the strongest moments (at most 30% of the
game by default) instead of the whole game.

## Running it

```
node src/cli.ts <first-video> <second-video> <output.mp4> [options]

  --mode broadcast|highlights   default broadcast
  --quiet-cut <seconds>         broadcast: leave out quiet stretches this long (90)
  --max-share <0..1>            highlights: most of the game to keep (0.3)
  --ffmpeg <path>               the ffmpeg to use (default: "ffmpeg" on the PATH)
  --work <folder>               where the small pieces are made
  --dry-run                     list the picks, make no video
  --offset <seconds>            skip lining up: the second video started this long after the first
```

Needs **ffmpeg** and **ffprobe** (free). Reads the two videos; writes only the
output, `<output>-picks.txt` beside it, and a work folder (removed when done).
It never changes, moves or deletes an original (a test checks this).

**Use a roomy drive for the output and the work folder.** The default work folder
is beside the output, on purpose: a laptop's own drive may be nearly full.

## What is proven, and what is not

Tested on made-up recordings with known sounds and movements, one started 7.3 s
after the other (`src/pipeline.test.ts`): it recovers the 7.3 s, finds the moments,
picks the right camera for each, follows the play in broadcast mode, joins real
video, and converts an HDR source to ordinary colours.

**Not yet proven on a real game.** The made-up recordings are cleaner than a
rink. Loudness and movement are only stand-ins for "where the puck is": a loud
board hit at the far end, or a bench full of moving people, can pull the picture
to the wrong end. The first real result is a draft to judge, and the picks list is
there to tune from. Known limits:

- The alignment's confidence number is only a rough guide: it is poor at telling a few unrelated events from a match. The tool also compares its answer with the two files' own start times and says so when they disagree by more than 20 seconds.
- If the second camera started **before** the first, its opening stretch is not used.
- The sound switches with the camera. One continuous sound track is a likely next step.
- A real HDR iPhone file has been converted only in a synthetic test.
- Rendering re-encodes the whole result: expect it to take a while on a laptop.
