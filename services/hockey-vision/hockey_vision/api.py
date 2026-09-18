"""The HTTP surface the app talks to.

Deliberately built on `http.server` from the standard library rather than
FastAPI. This service already asks for numpy, OpenCV and (optionally) torch;
adding a web framework to serve six endpoints on localhost is weight for
nothing. If it ever needs auth, streaming or concurrency it should be rewritten
on something real — and that is a decision to make then, not to pre-pay for now.

It binds to 127.0.0.1 by default. This process reads and writes arbitrary paths
under its media root, so exposing it on 0.0.0.0 would be handing anyone who can
reach the port a file-conversion service pointed at a family's video library.

Every path is resolved inside the media root and refused otherwise, so a
storage key of ../../etc/passwd cannot escape it.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable

from .detectors import Detector, DetectorUnavailable, select_detector
from .ocr import NumberReader, select_reader
from .pipeline import analyse_video
from .video import VideoError, cut_clip, ffmpeg_available, make_proxy, probe, render_reel


class UnsafeKey(ValueError):
    """A storage key that tried to leave the media root."""


@dataclass
class Settings:
    media_root: Path
    detector_name: str = "motion"
    reader_name: str = "none"
    host: str = "127.0.0.1"
    port: int = 4700

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            media_root=Path(os.environ.get("HOCKEY_MEDIA_ROOT", ".data/media")).resolve(),
            detector_name=os.environ.get("HOCKEY_DETECTOR", "motion"),
            reader_name=os.environ.get("HOCKEY_NUMBER_READER", "none"),
            host=os.environ.get("HOCKEY_VISION_HOST", "127.0.0.1"),
            port=int(os.environ.get("HOCKEY_VISION_PORT", "4700")),
        )


def resolve_key(root: Path, key: str) -> Path:
    """Turn a storage key into a path inside the media root, or refuse.

    `Path.resolve()` then a containment check, because a key like
    `../../.ssh/id_rsa` is a perfectly ordinary-looking string and this process
    has whatever filesystem access it was started with.
    """
    if not key or key.startswith("/") or "\x00" in key:
        raise UnsafeKey(f"Refusing a storage key that is not a relative path: {key!r}")
    candidate = (root / key).resolve()
    if candidate != root and root not in candidate.parents:
        raise UnsafeKey(f"Refusing a storage key that points outside the media root: {key!r}")
    return candidate


class Service:
    """The endpoints, free of HTTP so they can be tested directly."""

    def __init__(
        self,
        settings: Settings,
        detector: Detector | None = None,
        reader: NumberReader | None = None,
    ) -> None:
        self.settings = settings
        self.settings.media_root.mkdir(parents=True, exist_ok=True)
        self._detector = detector
        self._reader = reader

    @property
    def detector(self) -> Detector:
        if self._detector is None:
            self._detector = select_detector(self.settings.detector_name)
        return self._detector

    @property
    def reader(self) -> NumberReader:
        if self._reader is None:
            self._reader = select_reader(self.settings.reader_name)
        return self._reader

    def availability(self) -> dict[str, Any]:
        """Can this service actually do its job right now?

        Both halves have to be true — a model with no ffmpeg cannot make the
        proxy it needs to analyse, and ffmpeg with no model cannot analyse
        anything. Reporting them separately lets the app tell the user which
        one to fix.
        """
        detector = self.detector.available()
        media = ffmpeg_available()
        if not media:
            return {
                "ready": False,
                "detail": "Video tools are not installed, so no video can be read, cut or rendered.",
                "remedy": "Install ffmpeg and make sure ffmpeg and ffprobe are on PATH.",
                "detector": self.detector.id,
            }
        return {
            "ready": bool(detector.ready),
            "detail": detector.detail,
            "remedy": detector.remedy,
            "detector": self.detector.id,
        }

    def probe(self, body: dict[str, Any]) -> dict[str, Any]:
        path = resolve_key(self.settings.media_root, str(body["storage_key"]))
        return probe(path).as_dict()

    def proxy(self, body: dict[str, Any]) -> dict[str, Any]:
        key = str(body["storage_key"])
        source = resolve_key(self.settings.media_root, key)
        max_height = int(body.get("max_height", 540))
        proxy_key = f"proxies/{Path(key).stem}-{max_height}p.mp4"
        destination = resolve_key(self.settings.media_root, proxy_key)
        make_proxy(source, destination, max_height)
        return {"storage_key": proxy_key}

    def track(self, body: dict[str, Any]) -> dict[str, Any]:
        path = resolve_key(self.settings.media_root, str(body["storage_key"]))
        result = analyse_video(
            path,
            self.detector,
            reader=self.reader,
            frame_stride=int(body.get("frame_stride", 6)),
        )
        if body.get("reference_photo_key"):
            # Said out loud rather than left as a silent no-op. A user who
            # uploaded a photo will otherwise assume it was used.
            result.notes.append(
                "A reference photo was supplied, but this service does not compare "
                "faces or appearance, so it was not used."
            )
        return result.as_dict()

    def clip(self, body: dict[str, Any]) -> dict[str, Any]:
        key = str(body["storage_key"])
        source = resolve_key(self.settings.media_root, key)
        start, end = float(body["start"]), float(body["end"])
        clip_key = f"clips/{Path(key).stem}-{start:.2f}-{end:.2f}.mp4"
        cut_clip(source, resolve_key(self.settings.media_root, clip_key), start, end)
        return {"storage_key": clip_key}

    def reel(self, body: dict[str, Any]) -> dict[str, Any]:
        key = str(body["storage_key"])
        source = resolve_key(self.settings.media_root, key)
        cuts = [(float(c["start"]), float(c["end"])) for c in body["cuts"]]
        reel_key = f"reels/{Path(key).stem}-reel.mp4"
        render_reel(source, resolve_key(self.settings.media_root, reel_key), cuts)
        return {"storage_key": reel_key}


ROUTES: dict[str, str] = {
    "/probe": "probe",
    "/proxy": "proxy",
    "/track": "track",
    "/clip": "clip",
    "/reel": "reel",
}


def make_handler(service: Service) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
            # Default logging writes the client address and full request line
            # to stderr for every call. On a local service that is noise.
            pass

        def _send(self, status: int, payload: dict[str, Any]) -> None:
            encoded = json.dumps(payload).encode("utf8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:  # noqa: N802
            if self.path in ("/availability", "/health"):
                self._send(200, service.availability())
                return
            self._send(404, {"error": f"No such endpoint: {self.path}"})

        def do_POST(self) -> None:  # noqa: N802
            name = ROUTES.get(self.path)
            if name is None:
                self._send(404, {"error": f"No such endpoint: {self.path}"})
                return
            try:
                length = int(self.headers.get("content-length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}")
            except (ValueError, json.JSONDecodeError) as error:
                self._send(400, {"error": f"That request body was not valid JSON: {error}"})
                return

            handler: Callable[[dict[str, Any]], dict[str, Any]] = getattr(service, name)
            try:
                self._send(200, handler(body))
            except KeyError as error:
                self._send(400, {"error": f"Missing required field: {error}"})
            except UnsafeKey as error:
                self._send(400, {"error": str(error)})
            except DetectorUnavailable as error:
                # 503, not 200-with-empty-tracks. "I could not look" must never
                # arrive at a user wearing the same clothes as "I saw nothing".
                self._send(503, {"error": error.availability.detail,
                                 "remedy": error.availability.remedy})
            except VideoError as error:
                self._send(422, {"error": str(error)})

    return Handler


def serve(settings: Settings | None = None) -> None:
    resolved = settings or Settings.from_env()
    service = Service(resolved)
    server = ThreadingHTTPServer((resolved.host, resolved.port), make_handler(service))
    status = service.availability()
    print(f"hockey-vision listening on http://{resolved.host}:{resolved.port}")
    print(f"  detector: {service.detector.id}")
    print(f"  ready:    {status['ready']} — {status['detail']}")
    server.serve_forever()


if __name__ == "__main__":
    serve()
