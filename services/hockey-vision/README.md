# hockey-vision

The computer-vision service behind HighlightAI Hockey. It decodes video, finds
players, follows them between frames, and reads their jerseys.

It reports **what it saw**. It does not decide who anybody is — that judgement
lives in `packages/hockey-highlights`, which is pure TypeScript and can be
tested without a GPU.

## Why this exists at all

`docs/architecture/70-highlightai-broadcastai-evidence-audit.md` searched the
whole estate for HighlightAI and found a YouTube-embed gallery. Its conclusion
was that any HighlightAI surface must be labelled as having no engine behind it
**until real processing code is verified**. This directory is that code.

## What is real, and what it costs

| Stage                       | How it works                                       | Needs           |
| --------------------------- | -------------------------------------------------- | --------------- |
| Probe / proxy / clip / reel | ffmpeg                                             | ffmpeg, ffprobe |
| Player detection            | provider interface                                 | see below       |
| Tracking                    | ByteTrack-style two-pass association, written here | nothing         |
| Jersey colour               | HSV analysis of the torso crop                     | numpy, OpenCV   |
| Jersey number               | provider interface                                 | see below       |

**Detection** has two implementations. `yolo` is the real one and needs
`ultralytics`. `motion` is a model-free fallback using background subtraction —
a genuine algorithm, and on a fixed camera the moving foreground really is the
players, but it cannot tell a player from a referee and it says so in every
result it produces.

**Jersey numbers** default to reading nothing. That is the correct behaviour
with no OCR engine installed, not a stub. It means matches cap out at "possible"
or "likely" instead of "confirmed" — which is honest, because the number is the
only signal in a hockey game that is unique to one player.

## The rules it will not break

- **The original upload is never modified.** Every operation writes a new file.
- **Clips and reels are cut from the original, never from the proxy.** The proxy
  is a downscaled copy for a model to look at. Rendering a family's keepsake
  from it would hand them a soft, blocky video of their own child.
- **"I could not look" is never reported as "I saw nothing."** A detector that
  cannot run raises, and the HTTP layer returns 503. Zero tracks returned as
  success reads to a parent as "the analysis ran and your child did nothing".
- **Storage keys cannot escape the media root**, and the server binds to
  127.0.0.1. This process converts arbitrary files under its root; on 0.0.0.0 it
  would be a file-conversion service pointed at a family's video library.

## Running it

The Control Center starts this. Nobody needs to type anything.

If you are an engineer working on it directly:

```
pip install -r requirements.txt
./run.sh
python3 -m pytest tests/ -q
```

Configuration, all optional:

| Variable               | Default       | What it does                                                                               |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `HOCKEY_MEDIA_ROOT`    | `.data/media` | Where media lives. Nothing outside it is readable.                                         |
| `HOCKEY_DETECTOR`      | `motion`      | `yolo` or `motion`. There is no "auto" — which detector ran changes what the results mean. |
| `HOCKEY_NUMBER_READER` | `none`        | `tesseract` or `none`.                                                                     |
| `HOCKEY_VISION_PORT`   | `4700`        |                                                                                            |

## Endpoints

| Method | Path            | Purpose                                             |
| ------ | --------------- | --------------------------------------------------- |
| GET    | `/availability` | Can it run right now, and if not, what would fix it |
| POST   | `/probe`        | Duration, dimensions, frame rate, size              |
| POST   | `/proxy`        | Write the downscaled analysis copy                  |
| POST   | `/track`        | The whole analysis pass                             |
| POST   | `/clip`         | Cut one clip from the original                      |
| POST   | `/reel`         | Cut several and join them                           |

## Verified

`python3 -m pytest tests/ -q` — **65 passed**. That includes end-to-end tests
that write real MP4 files, push them through ffmpeg and the full
detect/track/classify pipeline, and assert on what comes back.

Two real defects were found by these tests during development and fixed:

1. **Tracking failed at the sampling rate the product actually uses.** IoU
   association assumes detections on every frame. Sampling at 5Hz, a skater
   moves further between analysed frames than their own box is wide, so
   consecutive boxes never overlapped and the tracker issued a new id every
   frame. Association now falls back to proximity, scaled by box size, with a
   wider gate for tracks whose velocity is not yet known.

2. **Every navy jersey was reported as blue.** Navy's definition sits inside
   blue's, so a mid-brightness navy pixel satisfied both completely and the
   winner was decided by list order. Ties now go to the narrower definition.
