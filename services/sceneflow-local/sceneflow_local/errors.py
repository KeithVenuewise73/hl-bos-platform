"""Errors that must never be swallowed."""


class ModelUnavailableError(RuntimeError):
    """A real adapter was asked to run and its model is not installed.

    This exists so a missing model fails loudly instead of quietly producing
    something else. There is no automatic fallback to the mock adapter anywhere
    in this package, and adding one would be a regression rather than a
    convenience.

    The reason is specific to this product. A fallback here would not crash and
    would not log anything alarming. It would hand back an image, and the person
    looking at it would reasonably believe the model had made it. Every claim
    the product makes about identity preservation and continuity would then be
    attached to output that had nothing to do with a model at all.

    To run without a model, ask for the mock adapter explicitly.
    """

    #: What to do about it, when the missing piece is the image model. A
    #: CHECKER gets a different sentence: "request the mock adapter" is advice
    #: that makes no sense for a missing content check, because there is no
    #: mock checker and there must never be one.
    DEFAULT_REMEDY = (
        "SceneFlow will not substitute a placeholder for a real model — "
        "request the mock adapter explicitly if that is what you want."
    )

    def __init__(self, adapter: str, detail: str, remedy: str | None = None) -> None:
        super().__init__(
            f"{adapter} is not available: {detail}. {remedy or self.DEFAULT_REMEDY}"
        )
        self.adapter = adapter
        self.detail = detail


class UnsafeJobError(RuntimeError):
    """A job reached the worker without having passed the safety boundary.

    The boundary lives in @hl-bos/sceneflow and runs long before anything gets
    here. This is the backstop: the worker refuses a job that is not stamped as
    having passed it, so a future caller that forgets to run the gate fails
    closed rather than generating quietly.
    """

    def __init__(self, detail: str) -> None:
        super().__init__(f"refusing to generate: {detail}")
        self.detail = detail
