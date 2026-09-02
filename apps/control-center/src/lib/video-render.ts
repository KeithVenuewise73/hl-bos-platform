/**
 * Browser-side rendering for the Video Studio.
 *
 * `@hl-bos/video-studio` decides what is on screen at a given millisecond; this
 * file puts it there and records it. It runs in the browser only — it touches
 * `document`, `canvas` and `MediaRecorder` and must never be imported by a
 * server component.
 *
 * Recording happens in REAL TIME, on purpose. Drawing frames as fast as the
 * machine allows and hoping MediaRecorder timestamps them correctly produces a
 * video that plays at the wrong speed on some machines and not others. Real
 * time means a 20-second video takes 20 seconds to record and looks exactly
 * like the preview, every time.
 */
import {
  composeFrame,
  totalDurationMs,
  type Frame,
  type Storyboard,
} from "@hl-bos/video-studio";

/** A source image already decoded and ready to draw. */
export type DrawableImage = HTMLImageElement | ImageBitmap;

export interface RecordingFormat {
  readonly mimeType: string;
  readonly extension: string;
  readonly label: string;
}

const CANDIDATES: readonly RecordingFormat[] = [
  { mimeType: "video/mp4;codecs=avc1.42E01E", extension: "mp4", label: "MP4 (H.264)" },
  { mimeType: "video/mp4", extension: "mp4", label: "MP4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm", label: "WebM (VP9)" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm", label: "WebM (VP8)" },
  { mimeType: "video/webm", extension: "webm", label: "WebM" },
];

/**
 * The best video format this browser can actually write, or null if it cannot
 * write video at all. Null is a real answer: the UI says so instead of showing
 * a Record button that would throw.
 */
export function pickFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
  }
  return null;
}

export function canRecord(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickFormat() !== null
  );
}

/** Paint one frame of the storyboard onto a 2D context. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  image: DrawableImage,
  storyboard: Storyboard,
  frame: Frame,
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = storyboard.background;
  ctx.fillRect(0, 0, storyboard.width, storyboard.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let caption = "";
  let captionAlpha = 0;
  for (const layer of frame.layers) {
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(
      image,
      layer.source.x,
      layer.source.y,
      layer.source.width,
      layer.source.height,
      layer.target.x,
      layer.target.y,
      layer.target.width,
      layer.target.height,
    );
    if (layer.caption !== "" && layer.opacity >= captionAlpha) {
      caption = layer.caption;
      captionAlpha = layer.opacity;
    }
  }

  if (caption !== "") drawCaption(ctx, storyboard, caption, captionAlpha);
  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  storyboard: Storyboard,
  text: string,
  alpha: number,
): void {
  const fontSize = Math.round(storyboard.height * 0.052);
  const padding = Math.round(storyboard.height * 0.035);
  ctx.globalAlpha = alpha;
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const metrics = ctx.measureText(text);
  const boxWidth = Math.min(storyboard.width - padding, metrics.width + fontSize * 1.4);
  const boxHeight = fontSize * 1.8;
  const boxY = storyboard.height - padding - boxHeight;

  ctx.fillStyle = "rgba(0, 0, 0, 0.62)";
  ctx.fillRect((storyboard.width - boxWidth) / 2, boxY, boxWidth, boxHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, storyboard.width / 2, boxY + boxHeight - fontSize * 0.55);
}

export interface RecordingResult {
  readonly blob: Blob;
  readonly format: RecordingFormat;
  readonly durationMs: number;
  readonly framesDrawn: number;
}

export interface RecordOptions {
  readonly canvas: HTMLCanvasElement;
  readonly image: DrawableImage;
  readonly storyboard: Storyboard;
  /** 0..1, called as the recording advances. */
  readonly onProgress?: (fraction: number) => void;
  /** Bitrate hint. Defaults to a generous 12 Mbps so panels stay crisp. */
  readonly bitsPerSecond?: number;
  readonly signal?: AbortSignal;
}

/**
 * Record the storyboard to a video file.
 *
 * Resolves with the finished blob. Rejects if the browser cannot record, if the
 * storyboard is empty, or if the caller aborts — never with a zero-byte file
 * dressed up as success.
 */
export async function recordStoryboard(
  options: RecordOptions,
): Promise<RecordingResult> {
  const { canvas, image, storyboard, onProgress, signal } = options;
  const format = pickFormat();
  if (!format) throw new Error("This browser cannot record video from a canvas.");

  const duration = totalDurationMs(storyboard);
  if (duration <= 0)
    throw new Error("The storyboard is empty — there is nothing to record.");

  canvas.width = storyboard.width;
  canvas.height = storyboard.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not get a 2D drawing context.");

  // Draw the first frame before the recorder starts so the file never opens on
  // a blank frame.
  drawFrame(ctx, image, storyboard, composeFrame(storyboard, 0));

  const stream = canvas.captureStream(storyboard.fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: options.bitsPerSecond ?? 12_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: format.mimeType }));
    recorder.onerror = () => reject(new Error("The browser's video recorder failed."));
  });

  let framesDrawn = 0;
  const started = performance.now();
  recorder.start();

  await new Promise<void>((resolve, reject) => {
    const tick = (): void => {
      if (signal?.aborted) {
        reject(new Error("Recording cancelled."));
        return;
      }
      const elapsed = performance.now() - started;
      const t = Math.min(elapsed, duration);
      drawFrame(ctx, image, storyboard, composeFrame(storyboard, t));
      framesDrawn += 1;
      onProgress?.(t / duration);
      if (elapsed >= duration) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).catch((error: unknown) => {
    recorder.stop();
    for (const track of stream.getTracks()) track.stop();
    throw error;
  });

  // One extra beat so the last drawn frame is definitely captured.
  await new Promise((resolve) =>
    setTimeout(resolve, Math.ceil(1000 / storyboard.fps) + 60),
  );
  recorder.stop();
  for (const track of stream.getTracks()) track.stop();

  const blob = await finished;
  if (blob.size === 0) throw new Error("The recorder produced an empty file.");
  return { blob, format, durationMs: duration, framesDrawn };
}

/** Read an image file into something drawable, and its pixels. */
export async function loadImage(
  file: Blob,
): Promise<{ drawable: ImageBitmap; pixels: ImageData }> {
  const drawable = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = drawable.width;
  canvas.height = drawable.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read the image's pixels.");
  ctx.drawImage(drawable, 0, 0);
  return { drawable, pixels: ctx.getImageData(0, 0, drawable.width, drawable.height) };
}
