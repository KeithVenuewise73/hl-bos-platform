"""The staged pipeline (brief sections 27 and 28).

Each stage has its own status, its own progress and its own error. Stages run in
order, and a failure stops the run at the stage that failed rather than
continuing and producing a half-analysis that looks complete.

PROGRESS IS NOT DECORATION. Analysing a two-hour game takes real time, and
during that time the progress display IS the product. So progress is computed
from completed stages weighted by real cost, a stage that cannot estimate its
remaining work reports ``None``, and nothing creeps toward 90% on a timer.
The weights match ``pipeline.ts`` exactly; ``tests/test_contract.py`` pins them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Iterable

from .errors import PipelineStageError


class Stage(str, Enum):
    UPLOAD = "upload"
    TRANSCODE = "transcode"
    PLAY_SEGMENTATION = "play_segmentation"
    PLAYER_DETECTION = "player_detection"
    TEAM_CLASSIFICATION = "team_classification"
    PLAYER_TRACKING = "player_tracking"
    JERSEY_OCR = "jersey_ocr"
    PLAYER_REIDENTIFICATION = "player_reidentification"
    FIELD_MAPPING = "field_mapping"
    BALL_DETECTION = "ball_detection"
    PLAYER_BALL_INTERACTION = "player_ball_interaction"
    EVENT_DETECTION = "event_detection"
    PLAYER_INVOLVEMENT = "player_involvement"
    HIGHLIGHT_SCORING = "highlight_scoring"
    CLIP_GENERATION = "clip_generation"
    OVERLAY_GENERATION = "overlay_generation"
    FINAL_EXPORT = "final_export"


class StageStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    SKIPPED = "skipped"


#: Proportions of wall-clock on a GPU run. Detection and tracking dominate
#: because they are the only stages that touch every frame. If measurement says
#: otherwise, change these — that is the point of having them in one place.
STAGE_COST: dict[Stage, int] = {
    Stage.UPLOAD: 2,
    Stage.TRANSCODE: 8,
    Stage.PLAY_SEGMENTATION: 4,
    Stage.PLAYER_DETECTION: 28,
    Stage.TEAM_CLASSIFICATION: 3,
    Stage.PLAYER_TRACKING: 16,
    Stage.JERSEY_OCR: 12,
    Stage.PLAYER_REIDENTIFICATION: 8,
    Stage.FIELD_MAPPING: 3,
    Stage.BALL_DETECTION: 6,
    Stage.PLAYER_BALL_INTERACTION: 2,
    Stage.EVENT_DETECTION: 3,
    Stage.PLAYER_INVOLVEMENT: 1,
    Stage.HIGHLIGHT_SCORING: 1,
    Stage.CLIP_GENERATION: 8,
    Stage.OVERLAY_GENERATION: 4,
    Stage.FINAL_EXPORT: 6,
}

#: Plain English, shown to the customer. No jargon: a person waiting on their
#: child's highlights should not have to know what a homography is.
STAGE_LABELS: dict[Stage, str] = {
    Stage.UPLOAD: "Receiving the game file",
    Stage.TRANSCODE: "Preparing a working copy",
    Stage.PLAY_SEGMENTATION: "Finding the plays",
    Stage.PLAYER_DETECTION: "Detecting players",
    Stage.TEAM_CLASSIFICATION: "Identifying the teams",
    Stage.PLAYER_TRACKING: "Tracking players",
    Stage.JERSEY_OCR: "Reading jersey numbers",
    Stage.PLAYER_REIDENTIFICATION: "Keeping hold of your player",
    Stage.FIELD_MAPPING: "Mapping the field",
    Stage.BALL_DETECTION: "Finding the football",
    Stage.PLAYER_BALL_INTERACTION: "Working out who has the ball",
    Stage.EVENT_DETECTION: "Recognising what happened",
    Stage.PLAYER_INVOLVEMENT: "Scoring your player's involvement",
    Stage.HIGHLIGHT_SCORING: "Ranking the highlights",
    Stage.CLIP_GENERATION: "Cutting the clips",
    Stage.OVERLAY_GENERATION: "Adding the spotlight",
    Stage.FINAL_EXPORT: "Exporting the reel",
}


@dataclass
class StageState:
    stage: Stage
    status: StageStatus = StageStatus.PENDING
    #: ``None`` means this stage genuinely cannot estimate. The UI shows an
    #: indeterminate bar rather than a number nobody computed.
    progress: float | None = None
    error: str | None = None


@dataclass
class PipelineProgress:
    fraction: float
    label: str
    completed_stages: int
    total_stages: int
    indeterminate: bool
    failed: bool = False


@dataclass
class Pipeline:
    """An ordered run of stages with honest progress."""

    stages: list[StageState] = field(default_factory=lambda: [StageState(s) for s in Stage])
    on_progress: Callable[[PipelineProgress], None] | None = None

    def _state(self, stage: Stage) -> StageState:
        for s in self.stages:
            if s.stage is stage:
                return s
        raise KeyError(stage)

    def start(self, stage: Stage) -> None:
        state = self._state(stage)
        state.status = StageStatus.RUNNING
        state.progress = None
        self._emit()

    def report(self, stage: Stage, progress: float | None) -> None:
        self._state(stage).progress = None if progress is None else min(1.0, max(0.0, progress))
        self._emit()

    def succeed(self, stage: Stage) -> None:
        state = self._state(stage)
        state.status = StageStatus.SUCCEEDED
        state.progress = 1.0
        self._emit()

    def skip(self, stage: Stage) -> None:
        self._state(stage).status = StageStatus.SKIPPED
        self._emit()

    def fail(self, stage: Stage, message: str) -> None:
        """Fail a stage. A failure MUST carry a message: "failed" with no reason
        is what forces a customer to go and ask an engineer."""
        if not message.strip():
            raise ValueError("a failed stage must say why")
        state = self._state(stage)
        state.status = StageStatus.FAILED
        state.error = message
        self._emit()

    def run(self, stage: Stage, work: Callable[[], None]) -> None:
        """Run one stage, recording the outcome honestly either way."""
        self.start(stage)
        try:
            work()
        except Exception as exc:  # noqa: BLE001 - the message is the product
            self.fail(stage, str(exc))
            raise PipelineStageError(stage.value, str(exc)) from exc
        self.succeed(stage)

    def progress(self) -> PipelineProgress:
        total = sum(STAGE_COST[s.stage] for s in self.stages)
        if total == 0:
            return PipelineProgress(0.0, "Waiting to start", 0, 0, True)

        done = 0.0
        completed = 0
        indeterminate = False
        current: StageState | None = None

        for s in self.stages:
            cost = STAGE_COST[s.stage]
            if s.status in (StageStatus.SUCCEEDED, StageStatus.SKIPPED):
                done += cost
                completed += 1
                continue
            if s.status is StageStatus.FAILED:
                # Reporting 80% next to a failure tells the user the job is
                # mostly fine when it is over.
                return PipelineProgress(
                    done / total, s.error or f"{STAGE_LABELS[s.stage]} failed",
                    completed, len(self.stages), False, failed=True,
                )
            if s.status is StageStatus.RUNNING and current is None:
                current = s
                if s.progress is None:
                    indeterminate = True
                else:
                    done += cost * s.progress

        if current is None:
            all_done = completed == len(self.stages)
            return PipelineProgress(
                1.0 if all_done else done / total,
                "Ready" if all_done else "Waiting to start",
                completed, len(self.stages), not all_done,
            )

        return PipelineProgress(
            done / total, STAGE_LABELS[current.stage], completed, len(self.stages), indeterminate,
        )

    def _emit(self) -> None:
        if self.on_progress is not None:
            self.on_progress(self.progress())


def stages_in_order() -> Iterable[Stage]:
    return list(Stage)
