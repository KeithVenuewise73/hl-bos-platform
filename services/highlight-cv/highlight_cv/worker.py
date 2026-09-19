"""The job runner.

Video analysis takes real compute, so it runs as a background job — never inside
a web request and never inside a serverless function. The brief says Redis +
Celery or an equivalent durable queue; this module is written so the queue is a
detail. ``run_analysis`` is a plain function taking a plain request, and Celery
is one thin wrapper around it (registered at the bottom, only when Celery is
installed).

That shape is not incidental. It means the whole pipeline is callable from a
test with no broker running, which is how ``tests/test_worker.py`` exercises it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Sequence

from .adapters.base import (
    Adapter,
    BallDetectorAdapter,
    Frame,
    JerseyNumberRecognizer,
    PlayerDetector,
    PlayerTracker,
    PlaySegmenter,
    TeamClassifier,
    is_fully_real,
)
from .pipeline import Pipeline, PipelineProgress, Stage
from .types import BallDetection, FrameSignal, JerseyReading, Track
from .vote import temporal_vote


@dataclass
class AnalysisRequest:
    video_id: str
    tenant_id: str
    player_id: str
    target_number: int
    frame_rate: float


@dataclass
class AnalysisResult:
    """What the worker hands back to the database.

    ``adapter_kind`` is computed from the adapters that actually ran, not passed
    in, so a caller cannot label a demo run 'real'.
    """

    video_id: str
    tracks: list[Track]
    signals: list[FrameSignal]
    ball: list[BallDetection]
    team_palette: list[tuple[str, tuple[int, int, int], float]]
    jersey_readings: dict[str, list[JerseyReading]] = field(default_factory=dict)
    voted_numbers: dict[str, tuple[int | None, float]] = field(default_factory=dict)
    adapter_kind: str = "demo"

    @property
    def is_demo(self) -> bool:
        return self.adapter_kind == "demo"


@dataclass
class AdapterSet:
    detector: PlayerDetector
    team_classifier: TeamClassifier
    jersey_recognizer: JerseyNumberRecognizer
    tracker: PlayerTracker
    ball_detector: BallDetectorAdapter
    segmenter: PlaySegmenter

    def all(self) -> list[Adapter]:
        return [
            self.detector, self.team_classifier, self.jersey_recognizer,
            self.tracker, self.ball_detector, self.segmenter,
        ]


def run_analysis(
    request: AnalysisRequest,
    frames: Sequence[Frame],
    adapters: AdapterSet,
    on_progress: Callable[[PipelineProgress], None] | None = None,
) -> AnalysisResult:
    """Run the vision pipeline over a decoded frame sequence.

    Note what this function does NOT do: it does not decide where the plays are,
    who the athlete is, or which plays are worth clipping. It produces
    observations. The football judgement happens in
    ``@hl-bos/highlight-football``, where it is tested without a video card.
    """
    pipeline = Pipeline(on_progress=on_progress)
    pipeline.succeed(Stage.UPLOAD)
    pipeline.succeed(Stage.TRANSCODE)

    detections_by_frame: dict[int, list] = {}
    ball: list[BallDetection] = []

    def detect() -> None:
        for i, frame in enumerate(frames):
            detections_by_frame[frame.frame] = adapters.detector.detect(frame)
            pipeline.report(Stage.PLAYER_DETECTION, (i + 1) / max(1, len(frames)))

    pipeline.run(Stage.PLAYER_DETECTION, detect)

    palette: list[tuple[str, tuple[int, int, int], float]] = []

    def classify_teams() -> None:
        nonlocal palette
        samples = [
            d.jersey_rgb
            for dets in detections_by_frame.values()
            for d in dets
            if d.jersey_rgb is not None
        ]
        palette = adapters.team_classifier.fit(samples)

    pipeline.run(Stage.TEAM_CLASSIFICATION, classify_teams)

    def track() -> None:
        for i, frame in enumerate(frames):
            adapters.tracker.update(frame, detections_by_frame.get(frame.frame, []))
            pipeline.report(Stage.PLAYER_TRACKING, (i + 1) / max(1, len(frames)))

    pipeline.run(Stage.PLAYER_TRACKING, track)
    tracks = adapters.tracker.flush()

    readings: dict[str, list[JerseyReading]] = {}
    voted: dict[str, tuple[int | None, float]] = {}

    def read_numbers() -> None:
        by_frame = {f.frame: f for f in frames}
        for track_obj in tracks:
            track_readings: list[JerseyReading] = []
            for det in track_obj.detections:
                frame = by_frame.get(det.at.frame)
                if frame is None:
                    continue
                track_readings.append(adapters.jersey_recognizer.read(frame, det))
            readings[track_obj.track_label] = track_readings
            vote = temporal_vote(track_readings)
            voted[track_obj.track_label] = (vote.number, vote.confidence)

    pipeline.run(Stage.JERSEY_OCR, read_numbers)

    # Re-identification and field mapping happen in the engine and are skipped
    # here rather than marked done: claiming a stage ran when it did not is the
    # same lie as claiming a result.
    pipeline.skip(Stage.PLAYER_REIDENTIFICATION)
    pipeline.skip(Stage.FIELD_MAPPING)

    def detect_ball() -> None:
        for i, frame in enumerate(frames):
            ball.extend(adapters.ball_detector.detect(frame))
            pipeline.report(Stage.BALL_DETECTION, (i + 1) / max(1, len(frames)))

    pipeline.run(Stage.BALL_DETECTION, detect_ball)

    signals: list[FrameSignal] = []

    def segment() -> None:
        nonlocal signals
        signals = adapters.segmenter.signals(frames)

    pipeline.run(Stage.PLAY_SEGMENTATION, segment)

    # Everything from here is the engine's work, and the worker does not pretend
    # otherwise: these stages stay pending until the engine reports back.
    return AnalysisResult(
        video_id=request.video_id,
        tracks=tracks,
        signals=signals,
        ball=ball,
        team_palette=palette,
        jersey_readings=readings,
        voted_numbers=voted,
        adapter_kind="real" if is_fully_real(adapters.all()) else "demo",
    )


def register_celery(app: object) -> None:  # pragma: no cover - needs a broker
    """Register ``run_analysis`` as a Celery task.

    Kept at the bottom and optional on purpose: the pipeline must be runnable,
    and testable, without a broker. A queue is infrastructure, not a dependency
    of the football.
    """
    task = getattr(app, "task", None)
    if task is None:
        raise TypeError("register_celery expects a Celery app")

    @task(name="highlight_cv.run_analysis", bind=True, max_retries=3)
    def _run(self, payload: dict) -> dict:  # noqa: ANN001, ANN202
        raise NotImplementedError(
            "Wire this to a frame source and an adapter set for your deployment."
        )
