"""The analysis pass.

Decode the proxy, detect players, track them, read their jerseys, and hand back
tracks. What those tracks *mean* — which one is the athlete, which stretches are
worth clipping — is decided in the TypeScript engine, not here. This service
reports what it saw; it does not decide who anybody is.

Two things this module is careful about:

  * **Sampling.** Only every Nth frame is analysed. A skater does not change
    much in 1/30th of a second, and analysing every frame of a 90-minute game
    is an hour of GPU time to learn nothing new.
  * **Jersey reads are attached to observations, not to tracks.** A player
    turns away, gets screened, skates into shadow; the number is readable in
    some frames and not others. Recording per-observation is what lets the
    engine weight by legibility instead of taking one lucky read as gospel.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np

from .detectors import Availability, Detector, DetectorUnavailable
from .jersey import classify_color, torso_crop
from .ocr import NumberReader, NullNumberReader, number_crop_bounds
from .tracking import ByteTracker, Track


@dataclass
class AnalysisResult:
    tracks: list[Track]
    detection_source: str
    frames_analysed: int
    frame_width: int
    frame_height: int
    used_reference_photo: bool = False
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        """The wire format the TypeScript HttpVisionProvider expects."""
        return {
            "tracks": [
                {
                    "id": f"track-{track.id}",
                    "observations": [
                        {
                            "frame": o.frame,
                            "time_seconds": round(o.time_seconds, 3),
                            "box": o.box.as_dict(),
                            "detection_score": round(o.detection_score, 3),
                            "jersey_color_id": o.jersey_color_id,
                            "jersey_color_score": round(o.jersey_color_score, 3),
                            "jersey_number": o.jersey_number,
                            "jersey_number_score": round(o.jersey_number_score, 3),
                        }
                        for o in track.observations
                    ],
                }
                for track in self.tracks
            ],
            "detection_source": self.detection_source,
            "frames_analysed": self.frames_analysed,
            "frame_width": self.frame_width,
            "frame_height": self.frame_height,
            "used_reference_photo": self.used_reference_photo,
            "notes": self.notes,
        }


def analyse_video(
    path: str | Path,
    detector: Detector,
    *,
    reader: NumberReader | None = None,
    frame_stride: int = 6,
    max_frames: int | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> AnalysisResult:
    """Run the whole pass over one video file.

    Raises `DetectorUnavailable` when the detector cannot run. That is
    deliberate and important: a job that cannot analyse must FAIL, loudly, and
    not return zero tracks. Zero tracks reads to a user as "the analysis ran and
    found nothing", which is a different and much more damaging statement.
    """
    import cv2

    availability = detector.available()
    if not availability.ready:
        raise DetectorUnavailable(availability)

    number_reader = reader or NullNumberReader()
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise DetectorUnavailable(
            Availability(
                False,
                "That video could not be opened for analysis.",
                "Check the file is a readable MP4 or MOV.",
            )
        )

    fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    if fps <= 0:
        # Unknown rate. 30 is the sampling assumption, and it is recorded in
        # the notes so a timeline that looks wrong can be traced to it.
        fps = 30.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    # About two seconds of tolerance, expressed in analysed frames, so a player
    # survives an occlusion whatever rate we happen to be sampling at.
    analysed_fps = max(1.0, fps / max(1, frame_stride))
    tracker = ByteTracker(max_missed=int(round(analysed_fps * 2)))

    frame_index = 0
    analysed = 0
    notes: list[str] = []

    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index % max(1, frame_stride) != 0:
            frame_index += 1
            continue

        detections = detector.detect(frame)
        time_seconds = frame_index / fps
        tracker.update(frame_index, time_seconds, detections)
        _read_jerseys(tracker, frame, frame_index, number_reader)

        analysed += 1
        if progress is not None and analysed % 50 == 0:
            progress(frame_index, analysed)
        if max_frames is not None and analysed >= max_frames:
            notes.append(
                f"Analysis stopped after {max_frames} sampled frames because a limit was set."
            )
            break
        frame_index += 1

    capture.release()
    tracks = tracker.finish()

    if not number_reader.available():
        notes.append(
            "No jersey-number reader is installed, so numbers were not read. "
            "Players are matched on jersey colour alone, which cannot tell "
            "team-mates apart — results will say 'possible' rather than 'confirmed'."
        )
    describe = getattr(detector, "describe", None)
    if callable(describe):
        notes.append(describe())

    return AnalysisResult(
        tracks=tracks,
        detection_source=f"{detector.id}+bytetrack",
        frames_analysed=analysed,
        frame_width=width,
        frame_height=height,
        used_reference_photo=False,
        notes=notes,
    )


def _read_jerseys(
    tracker: ByteTracker, frame: np.ndarray, frame_index: int, reader: NumberReader
) -> None:
    """Fill in colour and number on whatever was just observed.

    Only observations from THIS frame are touched. Re-reading history would
    overwrite a clear read from a moment ago with an illegible one now, and the
    engine's confidence weighting depends on keeping every read as it was made.
    """
    import cv2

    hsv: np.ndarray | None = None
    for track in tracker._active:  # noqa: SLF001 - same module's collaborator
        if not track.observations:
            continue
        observation = track.observations[-1]
        if observation.frame != frame_index:
            continue

        box = observation.box
        if hsv is None:
            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        crop = torso_crop(hsv, box.x, box.y, box.width, box.height)
        colour_id, colour_score = classify_color(crop)
        observation.jersey_color_id = colour_id
        observation.jersey_color_score = colour_score

        if reader.available():
            nx, ny, nw, nh = number_crop_bounds(box.x, box.y, box.width, box.height)
            h, w = frame.shape[:2]
            x0, y0 = int(max(0, nx)), int(max(0, ny))
            x1, y1 = int(min(w, nx + nw)), int(min(h, ny + nh))
            if x1 > x0 and y1 > y0:
                read = reader.read(frame[y0:y1, x0:x1])
                observation.jersey_number = read.digits
                observation.jersey_number_score = read.confidence
