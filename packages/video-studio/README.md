# @hl-bos/video-studio

Turns a still image into a video.

Give it a picture made of panels — a comic page, a storyboard, a grid of
screenshots — and it finds the panels, plans a shot list with pans and zooms,
and works out the exact frame at any millisecond. The Control Center's
[Video Studio](../../apps/control-center/src/app/video) records that plan to a
real `.mp4` in the browser.

## What it does not do

**It does not generate motion.** Every pixel on screen was in the image you gave
it. Nothing is invented, hallucinated or animated. What moves is the camera.

That is a different product from "hand the picture to a video model and get back
frames nobody drew", which needs a paid account and does not exist here yet.
`providers.ts` reports the difference honestly, and the console shows it, rather
than offering a button that would do nothing.

## Why it is shaped this way

The package is **pure**. It has no dependencies, touches no network, opens no
files and draws nothing. It answers one question — _what should be on screen at
millisecond N?_ — and the host puts it there.

That split is the whole point. A media pipeline that can only be tested by
watching a video is a pipeline nobody tests. Here the camera moves, the crossfade
timing, the clipping and the letterboxing are all plain data, checked by 62
ordinary unit tests in under a second.

```
detectPanels(image)        ->  where the panels are
buildStoryboard(detection) ->  the shot list
composeFrame(board, t)     ->  the exact rectangles to draw at time t
```

## How panel detection works

A separator between panels — a white gutter, a black rule, a coloured frame —
is **uniform along its entire length**. Artwork is not. So each row and column
gets a uniformity score: what fraction of its pixels sit within a tolerance of
that line's own mean colour. Runs scoring above the threshold are separators;
what is left between them is a panel.

Measuring uniformity rather than "is it white" is what lets the same code handle
a dark page, a light one and a screenshot grid without a per-image threshold.

When no grid is found it does **not** guess. It returns the whole image as one
shot and says so in `detection.note`.

## Framing: `contain` vs `fill`

A comic panel is usually near-square. A video is usually 16:9. Something has to
give.

- **`contain` (the default)** fits the whole panel in and pads the rest. Nothing
  the artist drew is thrown away.
- **`fill`** crops the panel to the frame. Punchier, but a caption bar along the
  top or bottom edge gets cut off — which is exactly what happened the first
  time this ran on a real comic page, deleting the lettering that carried the
  joke.

## Testing against a real image

The committed tests use synthetic grids, so no binary lives in the repository.
To run the same detector against real artwork:

```bash
HLBOS_VIDEO_FIXTURE=/path/to/page.png \
HLBOS_VIDEO_EXPECT_PANELS=6 \
pnpm --filter @hl-bos/video-studio test
```

It prints the panel rectangles and the resulting shot list, and asserts that
every frame of the storyboard references pixels that actually exist.

## Node-only extra

`@hl-bos/video-studio/png` is a minimal PNG reader used by that test. It is
deliberately narrow (8-bit, non-interlaced) and throws rather than returning
quietly-wrong pixels. The browser has its own decoder and does not need it.
