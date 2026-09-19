"""Reading frames out of a game file.

THE TRAP THIS MODULE EXISTS TO AVOID.

A two-hour game at 30fps is 216,000 frames. Running a detector on every one is
neither affordable nor necessary: play segmentation needs motion at roughly
10fps, and association only needs frames close enough together that a player
cannot cross another player between them. So the pipeline samples.

The moment you sample, there are two different frame numbers in play — the
index of the frame within the *sample* (0, 1, 2, …) and its index within the
*file* (0, 3, 6, …) — and confusing them is silent and total. Every timestamp
comes out scaled by the stride, so a snap detected at 32:15 gets recorded at
10:45, and every clip is cut minutes from the play it claims to show. Nothing
errors. The reel is simply wrong.

So `Frame` here always carries the TRUE frame index and the TRUE timestamp in
seconds, taken from the file, never derived from a counter. `sample_indices` is
kept pure and separately tested for exactly this reason.

OpenCV is imported lazily, so this module can be imported — and its arithmetic
tested — on a machine with no media toolchain at all.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from .adapters.base import Frame
from .errors import ModelUnavailableError


@dataclass(frozen=True)
class VideoInfo:
    path: str
    frame_count: int
    frame_rate: float
    width: int
    height: int

    @property
    def duration_seconds(self) -> float:
        return self.frame_count / self.frame_rate if self.frame_rate > 0 else 0.0


def sample_indices(frame_count: int, source_fps: float, target_fps: float) -> list[int]:
    """Which frames of the file to actually decode.

    Pure, and tested on its own, because this is the function that decides what
    every downstream timestamp means.

    A target at or above the source rate returns every frame rather than
    inventing some: you cannot sample faster than the camera filmed.
    """
    if frame_count <= 0 or source_fps <= 0 or target_fps <= 0:
        return []
    if target_fps >= source_fps:
        return list(range(frame_count))
    stride = source_fps / target_fps
    out: list[int] = []
    position = 0.0
    while position < frame_count:
        index = int(position)
        if not out or index > out[-1]:
            out.append(index)
        position += stride
    return out


def _cv2():
    try:
        import cv2  # noqa: PLC0415 - lazy on purpose; see the module docstring

        return cv2
    except ImportError as exc:  # pragma: no cover - only without the gpu extra
        raise ModelUnavailableError(
            "VideoReader", "`opencv-python-headless` is not installed (install the 'gpu' extra)"
        ) from exc


def probe(path: str) -> VideoInfo:
    """Read a file's real dimensions, rate and length.

    Raises rather than guessing. A file we cannot open is not a file with
    default properties, and a frame rate of 0 would poison every timestamp
    derived from it.
    """
    cv2 = _cv2()
    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        capture.release()
        raise ValueError(f"cannot open video: {path}")
    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    finally:
        capture.release()

    if fps <= 0:
        raise ValueError(f"video reports a frame rate of {fps}: {path}")
    if count <= 0:
        raise ValueError(f"video reports {count} frames: {path}")
    return VideoInfo(path=path, frame_count=count, frame_rate=fps, width=width, height=height)


def read_frames(path: str, target_fps: float = 10.0) -> Iterator[Frame]:
    """Decode the sampled frames of a video, in order.

    Decodes SEQUENTIALLY and skips, rather than seeking to each sampled frame.
    Seeking per frame looks tidier and is dramatically slower on a long file,
    because every seek lands on a keyframe and decodes forward from there
    anyway — on a two-hour game with one-second keyframes that is most of the
    file decoded several times over.

    Each `Frame` carries the index and timestamp AS THE FILE REPORTS THEM, never
    a running counter over the samples.
    """
    cv2 = _cv2()
    info = probe(path)
    wanted = set(sample_indices(info.frame_count, info.frame_rate, target_fps))
    if not wanted:
        return

    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        capture.release()
        raise ValueError(f"cannot open video: {path}")
    try:
        index = 0
        while True:
            ok, pixels = capture.read()
            if not ok:
                break
            if index in wanted:
                yield Frame(
                    frame=index,
                    seconds=index / info.frame_rate,
                    width=info.width,
                    height=info.height,
                    pixels=pixels,
                )
            index += 1
    finally:
        capture.release()


def sample_jersey_colors(pixels, box, samples: int = 24) -> tuple[int, int, int] | None:
    """Average BGR over the torso region of a detection box.

    THE TORSO, NOT THE BOX. A detection box is mostly not jersey: the top is
    helmet and sky, the bottom is pants and turf. Averaging the whole box gives
    a colour that is part grass, which is how a green field turns every uniform
    slightly green and pushes navy toward teal.

    So this reads the middle of the upper half — shoulders to waist — and
    returns RGB (OpenCV hands back BGR, and getting that backwards swaps red and
    blue teams, which is the single most embarrassing failure available here).
    """
    height = len(pixels)
    if height == 0:
        return None
    width = len(pixels[0])
    if width == 0:
        return None

    x0 = int((box.x + box.w * 0.30) * width)
    x1 = int((box.x + box.w * 0.70) * width)
    y0 = int((box.y + box.h * 0.22) * height)
    y1 = int((box.y + box.h * 0.55) * height)
    x0, x1 = max(0, min(x0, width - 1)), max(0, min(x1, width))
    y0, y1 = max(0, min(y0, height - 1)), max(0, min(y1, height))
    if x1 <= x0 or y1 <= y0:
        return None

    step_y = max(1, (y1 - y0) // max(1, int(samples ** 0.5)))
    step_x = max(1, (x1 - x0) // max(1, int(samples ** 0.5)))
    total_b = total_g = total_r = 0
    n = 0
    for y in range(y0, y1, step_y):
        row = pixels[y]
        for x in range(x0, x1, step_x):
            b, g, r = row[x][0], row[x][1], row[x][2]
            total_b += int(b)
            total_g += int(g)
            total_r += int(r)
            n += 1
    if n == 0:
        return None
    # BGR in, RGB out.
    return (total_r // n, total_g // n, total_b // n)
