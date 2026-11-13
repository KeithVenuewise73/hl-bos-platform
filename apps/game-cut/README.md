# Game Cut

**Two cameras, one game.** Turn two whole-game recordings into one broadcast-style
video, or cut highlights from a list of times. It runs on this computer only, with
no account, no database and no network. **Nothing is uploaded:** the videos are read
where they are, on your drive.

## Start it

Press **Start** next to **Game Cut** on the Development Control Center's home page.
It runs at `http://localhost:4605` and opens in your browser.

It needs **ffmpeg**, a free program. Game Cut looks for it on the PATH and in the
usual install places (winget, Chocolatey, Scoop, Program Files). If it is not found,
the page says so plainly and offers **Look again**.

## Whole game, one broadcast

1. **Choose the first video and the second** (the other end of the ice). Or paste
   their full paths.
2. Pick how much dead time to leave out: nothing, long breaks (3 minutes), intermissions
   (90 seconds, the default), or most dead time between plays (30 seconds).
3. **Show me what it picks.** It lines the two videos up by the sound they share,
   reads the action in each, and lists every piece and which camera it uses. **It
   makes no video yet.** For two long games this takes a while; the page shows how far
   along it is.
4. Check the list. Pick **Draft** (smaller picture, much quicker) to look first, or
   **Full** (1080p).
5. **Make the video…** and choose where to save it.

The result is about one game long, not two: both videos show the same game from
opposite ends, and each moment uses the camera nearer the action.

## Moments you want to be sure of

A plan can miss a moment, like a hit by your son. Game Cut cannot see where the puck is,
only how loud and busy things are. Under the list of picks, type the times that matter,
one per line (`53:25 big hit`), and say which clock you read them from: the first video,
the second video, or the finished video you watched, played from its start. Game Cut turns
each into game time, picks the camera nearer it, and puts that moment in over whatever the
plan had there, **including time it had cut out**. The rest of the plan is untouched. It
does not look at the videos again, so it takes seconds, not half an hour. Then make the
video again.

## Plans are saved

Looking at two long games takes the better part of an hour, so the plan is saved on this
computer (`%LOCALAPPDATA%\GameCut\plans`, the last ten). Close Game Cut, restart it, or let
Windows restart: the page shows the latest plan again, and you can make the video or add
moments to it without looking again. A plan names the video files; if they have moved,
making says so.

## A list of what it picked

Beside every finished video Game Cut saves `<name> - picks.txt`: every piece, its camera,
and its time on the first video's clock and on the second's, plus any name you gave a
moment. It is the way to say exactly which moment was missed.

## Highlights from times

Type the times of the moments you want, one per line, on the FIRST video's clock:

```
12:34 big hit
41:02 goal
1:02:15 breakaway
```

Each becomes a short clip (8 seconds before and 6 after by default; you can change
both). Clips that overlap are joined, so a play is never shown twice. With a second
video, each clip uses the camera whose picture changed more around that moment.
A line that cannot be read, and a time past the end of the video, are listed by name:
nothing is dropped silently.

## It keeps going if the page closes

Looking and making run as a **background job on this computer**, not in the browser
tab. Close the page, reload it, or let the tab sleep: the job carries on, and the page
picks it up again when you return. **Stop** ends it and keeps nothing: no half-written
video is left behind (the result is written under a temporary name and renamed only
when whole). Windows is kept awake while a job runs; **closing the laptop lid still puts
it to sleep.**

## Room on the drive

Before a long job starts, Game Cut works out how much room it needs (the small pieces
and the joined video are on the drive together, so about twice the finished size),
checks the drive, and refuses in plain words if it will not fit. Pieces are made beside
the finished video, never on the laptop's own drive unless that is where you save it
(and it warns you if so).

## What is proven, and what is not

Proven on **made-up two-camera recordings** with known sounds and movements: the
alignment, the choice of camera, following the play, cutting and joining real video,
stopping cleanly, the room check, and the whole screen driven in a real browser. One
real flaw was found that way (the alignment preferred a tiny overlap) and fixed.

**Not yet proven on a real game.** Loudness and movement only stand in for where the
puck is. A loud board hit at the far end can pull the picture to the wrong end, and a
bench full of moving people can look like action. The first real result is a draft to
judge; the list of picks is there to tune from.

Also not yet proven on Windows by the project's CI: the Windows file windows and
**Show it in its folder**. Pasting a path always works instead.

Known limits: if the second video started before the first, its opening stretch is
not used; the sound switches along with the camera (one continuous sound track is a
likely next step); a real HDR iPhone file has been converted only in a synthetic test,
and a copy of ffmpeg without HDR support is said so up front.

## Built from

`packages/game-cut` is the engine (see its README). This app adds the screen, the
background job, the file windows and the checks above.
