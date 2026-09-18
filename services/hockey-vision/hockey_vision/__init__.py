"""HighlightAI Hockey — the vision service.

Real processing code: video decode and transcode via ffmpeg, player detection
behind a provider interface, ByteTrack-style multi-object tracking, jersey
colour classification in HSV, and jersey-number OCR behind a second provider
interface.

It reports what it saw. It does not decide who anybody is — that judgement is
made by @hl-bos/hockey-highlights, which can be tested without a GPU.
"""

from .detectors import (
    Availability,
    Detector,
    DetectorUnavailable,
    MotionDetector,
    ScriptedDetector,
    YoloDetector,
    select_detector,
)
from .jersey import COLORS, classify_color, torso_crop
from .ocr import NullNumberReader, NumberRead, TesseractNumberReader, select_reader
from .pipeline import AnalysisResult, analyse_video
from .tracking import Box, ByteTracker, Detection, Track, iou
from .video import Probe, VideoError, cut_clip, ffmpeg_available, make_proxy, probe, render_reel

__all__ = [
    "AnalysisResult", "Availability", "Box", "ByteTracker", "COLORS", "Detection",
    "Detector", "DetectorUnavailable", "MotionDetector", "NullNumberReader",
    "NumberRead", "Probe", "ScriptedDetector", "TesseractNumberReader", "Track",
    "VideoError", "YoloDetector", "analyse_video", "classify_color", "cut_clip",
    "ffmpeg_available", "iou", "make_proxy", "probe", "render_reel",
    "select_detector", "select_reader", "torso_crop",
]
