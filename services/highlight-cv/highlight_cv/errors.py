"""Errors that must never be swallowed."""


class ModelUnavailableError(RuntimeError):
    """A real adapter was asked to run and its model is not installed.

    This exists so that a missing model fails loudly instead of falling back to
    the mock adapters. There is no automatic fallback anywhere in this package,
    and adding one would be a regression, not a convenience: the resulting reel
    would contain invented plays and would be indistinguishable from a real
    analysis of real film.

    To run without models, ask for the mock adapters explicitly.
    """

    def __init__(self, adapter: str, detail: str) -> None:
        super().__init__(
            f"{adapter} is not available: {detail}. HighlightAI will not "
            "substitute demo output for a real model — request the mock "
            "adapters explicitly if that is what you want."
        )
        self.adapter = adapter


class PipelineStageError(RuntimeError):
    """A pipeline stage failed, carrying the message the customer will read."""

    def __init__(self, stage: str, message: str) -> None:
        super().__init__(f"{stage}: {message}")
        self.stage = stage
        self.message = message
