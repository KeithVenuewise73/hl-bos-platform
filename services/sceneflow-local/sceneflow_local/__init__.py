"""SceneFlow AI local image worker.

Runs on the operator's own machine. No photograph leaves it, nothing is
metered, and no third party's content policy applies to what it produces —
which is also why the safety boundary that runs before it is not optional.
"""

from .errors import ModelUnavailableError, UnsafeJobError
from .models import MODEL_TIERS, ModelTier, choose_model
from .types import GenerationJob, GenerationOutcome

__all__ = [
    "MODEL_TIERS",
    "GenerationJob",
    "GenerationOutcome",
    "ModelTier",
    "ModelUnavailableError",
    "UnsafeJobError",
    "choose_model",
]
