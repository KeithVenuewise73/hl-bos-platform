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
from .models import Plan, plan_generation
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


def detect_ram_mb(read: Any = None) -> int | None:
    """Total system memory in MiB, or None when it cannot be read.

    Total rather than free, for the same reason the card is measured by total
    video memory: this answers "what can this machine hold", which is a
    property of the machine, not of whatever happens to be open right now.

    None means "could not tell". It is kept apart from a small number for the
    same reason as the card: one sends someone to check their machine, the
    other sends them to buy memory.
    """
    reader = read if read is not None else _read_total_ram_bytes
    try:
        total = reader()
    except Exception:  # noqa: BLE001 - every platform fails differently here
        return None
    if not total or total <= 0:
        return None
    return int(total // (1024 * 1024))


def _read_total_ram_bytes() -> int:  # pragma: no cover - depends on the host
    # Windows first, because that is the machine this was built for.
    if sys.platform == "win32":
        import ctypes

        class _Status(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong),
                ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = _Status()
        status.dwLength = ctypes.sizeof(_Status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            return 0
        return int(status.ullTotalPhys)

    if sys.platform == "darwin":
        done = subprocess.run(
            ["sysctl", "-n", "hw.memsize"],
            capture_output=True, text=True, timeout=10, check=False,
        )
        return int(done.stdout.strip()) if done.returncode == 0 else 0

    pages = os.sysconf("SC_PHYS_PAGES")
    page_size = os.sysconf("SC_PAGE_SIZE")
    return int(pages) * int(page_size)


def _has(module: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(module) is not None


class _Detect:
    """Sentinel for "not supplied, go and look".

    Needed because None already means something else here: "looked, could not
    tell". Defaulting the arguments to None made those two the same value, so
    a caller could not describe a machine whose memory is unreadable without
    the function quietly measuring the machine it is running on instead.
    """

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "<detect>"


DETECT = _Detect()


def doctor(
    vram_mb: int | None | _Detect = DETECT,
    ram_mb: int | None | _Detect = DETECT,
    has_module: Any = None,
) -> dict[str, Any]:
    """What this machine would do, and what is stopping it.

    `has_module` is injectable for the same reason the card and memory probes
    are: without it, a test asserting "the libraries are missing" passes on a
    bare machine and FAILS on a machine where they are installed -- which is
    the machine that matters. Three tests here did exactly that until the
    libraries were installed and run against for the first time.
    """
    vram = detect_vram_mb() if isinstance(vram_mb, _Detect) else vram_mb
    ram = detect_ram_mb() if isinstance(ram_mb, _Detect) else ram_mb
    plan = plan_generation(vram, ram)
    present = has_module if has_module is not None else _has
    torch_present = present("torch")
    diffusers_present = present("diffusers")
    tier = plan.tier if plan else None
    return {
        "vram_mb": vram,
        "ram_mb": ram,
        "device": plan.device if plan else None,
        "on_processor": plan.on_processor if plan else None,
        "torch_installed": torch_present,
        "diffusers_installed": diffusers_present,
        "would_load": tier.name if tier else None,
        "non_commercial": tier.non_commercial if tier else None,
        # Said out loud rather than implied. On the processor this is "weak",
        # and SceneFlow's whole premise is the same people across several
        # scenes -- the operator should read that here, not deduce it later.
        "holds_a_face": tier.identity if tier else None,
        "can_generate": bool(tier and torch_present and diffusers_present),
        "why_not": _why_not(vram, ram, plan, torch_present, diffusers_present),
    }


def _why_not(
    vram: int | None,
    ram: int | None,
    plan: Plan | None,
    torch_ok: bool,
    diffusers_ok: bool,
) -> str:
    if plan is None:
        if vram and vram > 0:
            return (
                f"The card has {vram} MiB of video memory, below what the smallest "
                "model needs, and there is not enough system memory to use the processor instead."
            )
        if ram and ram > 0:
            return (
                f"There is no usable card, and {ram} MiB of system memory is below what "
                "the smallest processor model needs."
            )
        return "No card and no readable system memory, so nothing could be chosen."
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
        adapter = (
            MockImageAdapter()
            if use_mock
            else LocalImageAdapter(detect_vram_mb(), ram_mb=detect_ram_mb())
        )
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
