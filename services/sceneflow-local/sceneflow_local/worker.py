"""The command line the console calls.

Two commands, both of which answer honestly when they cannot do the job:

    doctor                 what is installed, what card is here, what would load
    generate <job.json>    make one picture

Output is a single line of JSON on stdout, so the console never has to parse
prose. Errors go to stderr AND come back in the JSON, because a caller that
only reads one of the two would otherwise see a silent failure.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from typing import Any

from .adapters import LocalImageAdapter, MockImageAdapter
from .checker import CheckVerdict, ContentClassifier, SkinFractionScreen
from .errors import ModelUnavailableError, UnsafeJobError
from .models import choose_model
from .types import GenerationJob, GenerationOutcome


def detect_vram_mb(run: Any = None) -> int | None:
    """Video memory in MiB, or None when it cannot be read.

    None means "could not tell", never "none present". The caller must keep
    those apart: a machine with a card and a broken driver gets a different
    answer from a machine with no card, and merging them sends someone to buy
    hardware they already own.
    """
    runner = run if run is not None else _run_nvidia_smi
    output = runner()
    if not output:
        return None
    first = next((line.strip() for line in output.splitlines() if line.strip()), "")
    if not first:
        return None
    try:
        return int(float(first.split(",")[-1].strip()))
    except ValueError:
        return None


def _run_nvidia_smi() -> str:  # pragma: no cover - depends on the host
    if shutil.which("nvidia-smi") is None:
        return ""
    try:
        done = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return done.stdout if done.returncode == 0 else ""


def _has(module: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(module) is not None


def doctor(vram_mb: int | None = None) -> dict[str, Any]:
    vram = vram_mb if vram_mb is not None else detect_vram_mb()
    tier = choose_model(vram)
    torch_present = _has("torch")
    diffusers_present = _has("diffusers")
    return {
        "vram_mb": vram,
        "torch_installed": torch_present,
        "diffusers_installed": diffusers_present,
        "would_load": tier.name if tier else None,
        "non_commercial": tier.non_commercial if tier else None,
        "can_generate": bool(tier and torch_present and diffusers_present),
        "why_not": _why_not(vram, tier, torch_present, diffusers_present),
    }


def _why_not(vram: int | None, tier: Any, torch_ok: bool, diffusers_ok: bool) -> str:
    if vram is None:
        return "No NVIDIA card could be read on this machine."
    if tier is None:
        return f"The card has {vram} MiB of video memory, below what the smallest model needs."
    missing = [n for n, ok in (("torch", torch_ok), ("diffusers", diffusers_ok)) if not ok]
    if missing:
        return f"The model libraries are not installed yet ({', '.join(missing)})."
    return ""


def check_output(image_path: str, checkers: Any = None) -> CheckVerdict:
    """Decide whether a generated image may be shown.

    FAILS CLOSED, and the shape of this function is why. Every checker runs;
    ANY rejection wins; and the result is only `passed` if a checker that is
    ALLOWED TO APPROVE said so. With no classifier installed the best possible
    outcome is `unverified`, which the caller treats as a refusal.

    Written this way rather than as "if the classifier is missing, skip it"
    because that sentence is how an unchecked image ends up on screen.
    """
    pool = checkers if checkers is not None else (SkinFractionScreen(), ContentClassifier())
    approved = False
    # Two slots, because WHICH failure gets reported decides whether the
    # message names something actionable. A screen saying "could not decode"
    # is true but useless; the classifier's absence is what actually blocks
    # every image, and its message says how to fix it. So a verdict from a
    # checker that CAN approve is preferred when reporting.
    blocking: CheckVerdict | None = None
    other: CheckVerdict | None = None

    for checker in pool:
        can_approve = bool(getattr(checker, "can_approve", False))
        try:
            verdict = checker.check(image_path)
        except ModelUnavailableError as exc:
            unavailable = CheckVerdict(
                status="unverified",
                checker=getattr(checker, "name", "checker"),
                reasons=("checker_unavailable",),
                detail=str(exc),
            )
            if can_approve and blocking is None:
                blocking = unavailable
            elif other is None:
                other = unavailable
            continue
        if verdict.status == "rejected":
            return verdict
        if verdict.status == "passed" and can_approve:
            approved = True
        # Only a NON-passing verdict is remembered as the thing to report. A
        # `passed` from a checker that is not allowed to approve must not be
        # returned verbatim — that would let a screen approve an image by
        # saying the word, which is the hole `can_approve` exists to close.
        if verdict.status != "passed":
            if can_approve and blocking is None:
                blocking = verdict
            elif other is None:
                other = verdict

    if approved:
        return CheckVerdict(status="passed", checker="output checks", reasons=())
    if blocking is not None:
        return blocking
    if other is not None:
        return other
    return CheckVerdict(
        status="unverified",
        checker="output checks",
        reasons=("nothing_checked_it",),
        detail="Nothing was able to check the generated image, so it was not shown.",
    )


def run_job(
    raw: dict[str, Any],
    use_mock: bool = False,
    checkers: Any = None,
) -> GenerationOutcome:
    job = GenerationJob.from_dict(raw)
    try:
        adapter = MockImageAdapter() if use_mock else LocalImageAdapter(detect_vram_mb())
        outcome = adapter.generate(job)
    except ModelUnavailableError as exc:
        return GenerationOutcome(
            ok=False,
            job_id=job.job_id,
            error_code="model_unavailable",
            error_message=str(exc),
        )
    except UnsafeJobError as exc:
        return GenerationOutcome(
            ok=False,
            job_id=job.job_id,
            error_code="unsafe_job",
            error_message=str(exc),
        )

    if not outcome.ok or not outcome.image_path:
        return outcome

    verdict = check_output(outcome.image_path, checkers)
    if verdict.safe_to_show:
        return outcome

    # The image exists and may not be shown, so it does not get to exist. An
    # unshowable picture left on disk is the thing this whole check is for.
    _discard(outcome.image_path)
    return GenerationOutcome(
        ok=False,
        job_id=job.job_id,
        error_code=(
            "output_rejected" if verdict.status == "rejected" else "output_unverified"
        ),
        error_message=verdict.detail
        or "The generated image could not be shown, and was deleted.",
    )


def _discard(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:  # pragma: no cover - already gone is the same outcome
        pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sceneflow-local")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    gen = sub.add_parser("generate")
    gen.add_argument("job", help="path to a job JSON file")
    gen.add_argument(
        "--mock",
        action="store_true",
        help="use the placeholder adapter. Never selected automatically.",
    )
    args = parser.parse_args(argv)

    if args.command == "doctor":
        print(json.dumps(doctor()))
        return 0

    with open(args.job, "r", encoding="utf-8") as handle:
        raw = json.load(handle)
    outcome = run_job(raw, use_mock=bool(args.mock))
    print(json.dumps(outcome.to_dict()))
    if not outcome.ok:
        print(outcome.error_message, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
