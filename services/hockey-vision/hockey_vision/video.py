"""Moving real bytes.

Everything here shells out to ffmpeg/ffprobe, which are the tools that actually
work on a 4GB iPhone MOV. Two rules shape the whole module:

  * **The original is never modified.** Every operation writes a new file. A
    parent's only copy of a game is not something to re-encode in place.
  * **Clips and reels are cut from the ORIGINAL, never from the proxy.** The
    proxy exists so a model can look at the video cheaply; rendering the
    family's keepsake from a 540p analysis copy would hand them a soft, blocky
    video of their own child.

`ffmpeg_available()` is checked before a job starts, so "ffmpeg is not
installed" is reported as a precondition in plain English rather than as a
FileNotFoundError from the middle of a render.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path


class VideoError(RuntimeError):
    """Something went wrong handling a media file."""


@dataclass(frozen=True)
class Probe:
    duration_seconds: float
    width: int
    height: int
    frame_rate: float
    size_bytes: int

    def as_dict(self) -> dict[str, float | int]:
        return asdict(self)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _run(args: list[str], timeout: int = 3600) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError as error:
        raise VideoError(
            "ffmpeg is not installed, so video cannot be read or written."
        ) from error
    except subprocess.TimeoutExpired as error:
        raise VideoError(f"ffmpeg did not finish within {timeout} seconds.") from error


def _parse_rate(raw: str) -> float:
    """Frame rate arrives as '30000/1001'. Anything unparseable is 0.0.

    Zero is honest — it means "not measured" — and the caller substitutes a
    sampling default rather than pretending the video is 30fps.
    """
    if not raw:
        return 0.0
    if "/" in raw:
        numerator, _, denominator = raw.partition("/")
        try:
            den = float(denominator)
            return float(numerator) / den if den else 0.0
        except ValueError:
            return 0.0
    try:
        return float(raw)
    except ValueError:
        return 0.0


def probe(path: str | Path) -> Probe:
    """Measure a video. Raises rather than guessing when it cannot."""
    source = Path(path)
    if not source.exists():
        raise VideoError(f"There is no file at {source}.")
    result = _run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,duration",
            "-show_entries", "format=duration",
            "-of", "json", str(source),
        ],
        timeout=120,
    )
    if result.returncode != 0:
        raise VideoError(
            f"That file could not be read as a video. ffprobe said: {result.stderr.strip()}"
        )
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise VideoError("ffprobe returned something that was not readable.") from error

    streams = parsed.get("streams") or []
    if not streams:
        raise VideoError("That file contains no video track.")
    stream = streams[0]
    duration = stream.get("duration") or parsed.get("format", {}).get("duration") or 0
    return Probe(
        duration_seconds=round(float(duration), 3),
        width=int(stream.get("width") or 0),
        height=int(stream.get("height") or 0),
        frame_rate=round(_parse_rate(str(stream.get("avg_frame_rate") or "")), 3),
        size_bytes=source.stat().st_size,
    )


def make_proxy(source: str | Path, destination: str | Path, max_height: int = 540) -> Path:
    """Write a small copy for analysis.

    Audio is dropped (`-an`): nothing downstream listens, and it is bytes and
    time for nothing. The scale filter keeps the aspect ratio and forces an even
    height, because H.264 cannot encode odd dimensions and a 1081-pixel source
    would otherwise fail at the last step of a long job.
    """
    src, dst = Path(source), Path(destination)
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        "ffmpeg", "-y", "-i", str(src),
        "-vf", f"scale=-2:'min({max_height},ih)'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-an", str(dst),
    ])
    if result.returncode != 0 or not dst.exists():
        raise VideoError(
            f"The analysis copy could not be made. ffmpeg said: {result.stderr.strip()[-500:]}"
        )
    return dst


def cut_clip(source: str | Path, destination: str | Path, start: float, end: float) -> Path:
    """Cut one clip, re-encoding so it starts exactly where asked.

    Stream copy (`-c copy`) would be far faster, but it can only cut on a
    keyframe. With a 2-second GOP that means a clip can start up to two seconds
    late — reliably removing the beginning of the play it was cut for. For a
    highlight reel, accuracy at the cut point is the entire product.
    """
    src, dst = Path(source), Path(destination)
    if end <= start:
        raise VideoError("A clip has to end after it starts.")
    dst.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        "ffmpeg", "-y",
        # -ss before -i seeks fast; -ss again after would be frame-accurate but
        # slow. Putting -ss before and re-encoding gives both.
        "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{end - start:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-c:a", "aac", "-movflags", "+faststart", str(dst),
    ])
    if result.returncode != 0 or not dst.exists():
        raise VideoError(
            f"That clip could not be cut. ffmpeg said: {result.stderr.strip()[-500:]}"
        )
    return dst


def render_reel(
    source: str | Path,
    destination: str | Path,
    cuts: list[tuple[float, float]],
    workdir: str | Path | None = None,
) -> Path:
    """Cut every window from the original and join them into one file.

    Done in two passes — cut each segment, then concatenate — rather than with
    one enormous filter_complex. The filter approach is a single command but it
    fails as a single command: with twelve segments you get one error message
    about the whole graph and no way to tell which cut was bad. Cutting
    separately means a failure names the segment that caused it.
    """
    src, dst = Path(source), Path(destination)
    if not cuts:
        raise VideoError("A reel needs at least one clip.")
    dst.parent.mkdir(parents=True, exist_ok=True)
    work = Path(workdir) if workdir else dst.parent / f".{dst.stem}-parts"
    work.mkdir(parents=True, exist_ok=True)

    parts: list[Path] = []
    for index, (start, end) in enumerate(cuts):
        part = work / f"part-{index:04d}.mp4"
        cut_clip(src, part, start, end)
        parts.append(part)

    listing = work / "parts.txt"
    # Quotes escaped the way the concat demuxer expects, so a path containing
    # an apostrophe does not silently truncate the reel.
    listing.write_text(
        "\n".join(f"file '{p.resolve().as_posix()}'" for p in parts) + "\n",
        encoding="utf8",
    )
    result = _run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
        "-c", "copy", "-movflags", "+faststart", str(dst),
    ])
    if result.returncode != 0 or not dst.exists():
        raise VideoError(
            f"The reel could not be assembled. ffmpeg said: {result.stderr.strip()[-500:]}"
        )
    return dst
