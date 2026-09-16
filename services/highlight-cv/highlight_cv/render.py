"""FFmpeg command construction.

PURE. Every function here returns an argument LIST and touches nothing. FFmpeg
does not need to be installed to test this module, which matters because the
mistakes that ruin an export are made here — a seek in the wrong place, a filter
in the wrong order, a crop that drifts off the frame — and they are all visible
in the argument list.

Argument lists, never shell strings: a game called ``West Seneca "Home" ; rm``
is a filename, not a command.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from .types import BoundingBox


@dataclass(frozen=True)
class ClipSpec:
    source_path: str
    output_path: str
    start_seconds: float
    end_seconds: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end_seconds - self.start_seconds)


def clip_command(spec: ClipSpec, *, reencode: bool = True) -> list[str]:
    """Cut one clip.

    ``-ss`` goes BEFORE ``-i`` so FFmpeg seeks rather than decoding from zero —
    the difference between two seconds and four minutes on a two-hour file. That
    seek lands on the nearest keyframe, which is why ``reencode`` defaults to
    True: stream-copying would silently move the clip start by up to a
    keyframe interval, and the brief's 5-second pre-snap lead-in would become
    whatever the encoder felt like.
    """
    if spec.duration <= 0:
        raise ValueError("clip duration must be positive")
    args = ["ffmpeg", "-hide_banner", "-nostdin", "-y",
            "-ss", f"{spec.start_seconds:.3f}", "-i", spec.source_path,
            "-t", f"{spec.duration:.3f}"]
    if reencode:
        args += ["-c:v", "libx264", "-preset", "medium", "-crf", "20",
                 "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k"]
    else:
        args += ["-c", "copy"]
    args.append(spec.output_path)
    return args


def crop_filter(windows: Sequence[tuple[float, BoundingBox]], width: int, height: int,
                out_width: int, out_height: int) -> str:
    """Build a time-varying crop filter that follows the athlete.

    The crop origin is expressed as an ``if`` chain over ``t`` rather than a
    single value, so the window tracks the planned path. It is clamped to the
    frame in the expression itself: a path that drifts a pixel outside produces
    a black edge on the export, and clamping at plan time is not enough because
    rounding happens here.
    """
    if not windows:
        raise ValueError("a crop path needs at least one window")

    first = windows[0][1]
    cw = max(1, int(round(first.w * width)))
    ch = max(1, int(round(first.h * height)))

    def expr(axis: str) -> str:
        out = "0"
        for seconds, box in reversed(windows):
            value = box.x * width if axis == "x" else box.y * height
            limit = width - cw if axis == "x" else height - ch
            clamped = min(max(value, 0), max(limit, 0))
            out = f"if(gte(t,{seconds:.3f}),{clamped:.2f},{out})"
        return out

    return (
        f"crop={cw}:{ch}:'{expr('x')}':'{expr('y')}',"
        f"scale={out_width}:{out_height}:flags=lanczos"
    )


def spotlight_filter(markers: Sequence[tuple[float, BoundingBox]], width: int, height: int) -> str:
    """Draw the tracking marker.

    ``drawbox``, not a filled shape. The brief's constraint — do not obscure the
    play — is the whole design: an outline says "him" without hiding what he is
    doing. Each box is gated by ``enable`` so the marker follows him frame by
    frame and disappears when it should.
    """
    if not markers:
        return "null"
    parts: list[str] = []
    for i, (seconds, box) in enumerate(markers):
        nxt = markers[i + 1][0] if i + 1 < len(markers) else seconds + 0.05
        parts.append(
            f"drawbox=x={int(box.x * width)}:y={int(box.y * height)}:"
            f"w={max(2, int(box.w * width))}:h={max(2, int(box.h * height))}:"
            f"color=0x19c37d@0.95:t=3:"
            f"enable='between(t,{seconds:.3f},{nxt:.3f})'"
        )
    return ",".join(parts)


def concat_command(clip_paths: Sequence[str], list_file: str, output_path: str) -> list[str]:
    """Join the finished clips into the reel.

    The concat DEMUXER, not the filter: the clips were encoded identically a
    moment ago, so stream copy is exact and takes seconds instead of re-encoding
    the whole reel and losing a generation of quality.
    """
    if not clip_paths:
        raise ValueError("a reel needs at least one clip")
    return ["ffmpeg", "-hide_banner", "-nostdin", "-y",
            "-f", "concat", "-safe", "0", "-i", list_file,
            "-c", "copy", "-movflags", "+faststart", output_path]


def concat_list_contents(clip_paths: Sequence[str]) -> str:
    """The concat list file. Single quotes inside a path are escaped, because a
    filename is data and this file is parsed."""
    return "".join(f"file '{p.replace(chr(39), chr(39) + chr(92) + chr(39) + chr(39))}'\n" for p in clip_paths)


def proxy_command(source_path: str, output_path: str, height: int = 720) -> list[str]:
    """Make the working copy the pipeline analyses.

    Analysis runs on a 720p proxy, not the master. A 4K game file costs four
    times the decode for detections that are normalised to 0..1 anyway — the
    boxes mean the same thing, and the export still cuts from the master.
    """
    return ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", source_path,
            "-vf", f"scale=-2:{height}", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            output_path]


def title_card_command(text: str, subtitle: str, seconds: float, output_path: str,
                       width: int = 1920, height: int = 1080) -> list[str]:
    """Render an opening or closing card."""
    if seconds <= 0:
        raise ValueError("a title card needs a positive duration")
    safe = text.replace(":", r"\:").replace("'", r"\'")
    safe_sub = subtitle.replace(":", r"\:").replace("'", r"\'")
    return ["ffmpeg", "-hide_banner", "-nostdin", "-y",
            "-f", "lavfi", "-i", f"color=c=0x07090d:s={width}x{height}:d={seconds:.2f}",
            "-vf",
            f"drawtext=text='{safe}':fontcolor=0xeaf0f7:fontsize={int(height * 0.09)}:"
            f"x=(w-text_w)/2:y=(h-text_h)/2-{int(height * 0.04)},"
            f"drawtext=text='{safe_sub}':fontcolor=0x19c37d:fontsize={int(height * 0.045)}:"
            f"x=(w-text_w)/2:y=(h-text_h)/2+{int(height * 0.06)}",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            output_path]
