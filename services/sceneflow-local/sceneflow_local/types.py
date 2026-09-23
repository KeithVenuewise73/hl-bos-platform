"""The job contract between the console and this worker.

Plain dataclasses over a JSON document, because the console hands this process
a file and reads a file back. No network, no shared database, no sockets: the
smallest possible surface between a TypeScript app and a Python process.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class GenerationJob:
    """One picture to make."""

    job_id: str
    """The prompt, composed server-side by @hl-bos/sceneflow. Never user text."""
    prompt: str
    """Where to write the result. The console owns this path."""
    output_path: str
    """Source photograph, for image-to-image. Empty for a fresh generation."""
    source_image: str = ""
    """Per-character reference images, where the model supports them."""
    reference_images: tuple[str, ...] = ()
    width: int = 832
    height: int = 1040
    steps: int = 28
    seed: int | None = None
    """Set by the caller ONLY after the safety boundary has passed. See
    UnsafeJobError: the worker refuses a job without it."""
    safety_checked: bool = False

    @staticmethod
    def from_dict(raw: dict[str, Any]) -> "GenerationJob":
        missing = [k for k in ("job_id", "prompt", "output_path") if not raw.get(k)]
        if missing:
            raise ValueError(f"job is missing required field(s): {', '.join(missing)}")
        refs = raw.get("reference_images") or []
        if not isinstance(refs, list):
            raise ValueError("reference_images must be a list")
        seed = raw.get("seed")
        return GenerationJob(
            job_id=str(raw["job_id"]),
            prompt=str(raw["prompt"]),
            output_path=str(raw["output_path"]),
            source_image=str(raw.get("source_image") or ""),
            reference_images=tuple(str(r) for r in refs),
            width=int(raw.get("width", 832)),
            height=int(raw.get("height", 1040)),
            steps=int(raw.get("steps", 28)),
            seed=None if seed is None else int(seed),
            safety_checked=bool(raw.get("safety_checked", False)),
        )


@dataclass(frozen=True)
class GenerationOutcome:
    """What happened. `ok` false always carries a reason a person can read."""

    ok: bool
    job_id: str
    image_path: str = ""
    """'real' or 'mock'. Carried so nothing downstream can mistake one for the
    other, the same way highlight.ai_jobs records adapter_kind."""
    adapter_kind: str = ""
    model: str = ""
    """'cuda' or 'cpu'. Carried because the same prompt on the two is a
    different wait and a different picture, and the page should not guess."""
    device: str = ""
    """How long generation actually took. MEASURED, never estimated: nobody
    here knows how fast the operator's processor is, and inventing a number
    would be inventing an operational metric."""
    seconds: float = 0.0
    error_code: str = ""
    error_message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "job_id": self.job_id,
            "image_path": self.image_path,
            "adapter_kind": self.adapter_kind,
            "model": self.model,
            "device": self.device,
            "seconds": round(self.seconds, 1),
            "error_code": self.error_code,
            "error_message": self.error_message,
        }
