"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SEQUENCE_OPTIONS,
  buildStoryboard,
  cameraAspect,
  composeFrame,
  detectPanels,
  layoutSequence,
  resolveMove,
  sequenceDetection,
  shotTimings,
  totalDurationMs,
  type CameraMove,
  type FitMode,
  type PanelDetection,
  type SequenceLayout,
  type Storyboard,
} from "@hl-bos/video-studio";

import {
  canRecord,
  composeSheet,
  drawFrame,
  loadImage,
  loadPhoto,
  pickFormat,
  recordStoryboard,
  type DrawableImage,
  type RecordingFormat,
} from "@/lib/video-render";

const MOVES: readonly CameraMove[] = [
  "push-in",
  "pull-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "hold",
];

const SHAPES = [
  { id: "auto", label: "Match the picture", width: 0, height: 0 },
  { id: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 },
  { id: "portrait", label: "Portrait 9:16", width: 1080, height: 1920 },
  { id: "square", label: "Square 1:1", width: 1080, height: 1080 },
] as const;

type ShapeId = (typeof SHAPES)[number]["id"];

const BACKGROUNDS = [
  { id: "#000000", label: "Black" },
  { id: "#ffffff", label: "White" },
  { id: "#0b0d10", label: "Console dark" },
] as const;

/**
 * The output size for "Match the picture": the shape of the panels themselves,
 * scaled so the long edge is 1440 and both edges are even numbers, which every
 * video encoder wants.
 */
function autoSize(detection: PanelDetection): { width: number; height: number } {
  const reference = detection.panels[0]?.bounds ?? {
    width: detection.source.width,
    height: detection.source.height,
  };
  const aspect = reference.width / reference.height;
  const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);
  return aspect >= 1
    ? { width: even(1440), height: even(1440 / aspect) }
    : { width: even(1440 * aspect), height: even(1440) };
}

const PREVIEW_WIDTH = 880;

const panelIdOf = (shotId: string): string | null =>
  shotId.startsWith("shot-panel-") ? shotId.slice("shot-".length) : null;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export function VideoStudio() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [drawable, setDrawable] = useState<DrawableImage | null>(null);
  // One picture: its panels are found in its pixels. Several photos: they are
  // painted onto one sheet, and `order` says which plays when.
  const [single, setSingle] = useState<PanelDetection | null>(null);
  const [sequence, setSequence] = useState<{
    layout: SequenceLayout;
    photos: readonly { name: string; bitmap: ImageBitmap }[];
  } | null>(null);
  const [order, setOrder] = useState<readonly number[]>([]);
  const detection: PanelDetection | null = useMemo(
    () => (sequence ? sequenceDetection(sequence.layout, order) : single),
    [sequence, order, single],
  );
  const isSequence = sequence !== null;
  const photoName = useCallback(
    (panelId: string): string | null => {
      const n = /^panel-photo-(\d+)$/.exec(panelId)?.[1];
      return n && sequence ? (sequence.photos[Number(n) - 1]?.name ?? null) : null;
    },
    [sequence],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [shape, setShape] = useState<ShapeId>("auto");
  const [fit, setFit] = useState<FitMode>("contain");
  const [background, setBackground] = useState<string>("#000000");
  const [shotDurationMs, setShotDurationMs] = useState(2600);
  const [transitionMs, setTransitionMs] = useState(420);
  const [zoom, setZoom] = useState(0.84);
  const [wides, setWides] = useState(true);

  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [moveOverrides, setMoveOverrides] = useState<
    Readonly<Record<string, CameraMove>>
  >({});
  const [captions, setCaptions] = useState<Readonly<Record<string, string>>>({});

  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [recordingProgress, setRecordingProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{
    url: string;
    format: RecordingFormat;
    size: number;
  } | null>(null);

  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const panelsRef = useRef<HTMLCanvasElement | null>(null);
  const recordRef = useRef<HTMLCanvasElement | null>(null);

  const [format, setFormat] = useState<RecordingFormat | null>(null);
  const [recordable, setRecordable] = useState<boolean | null>(null);
  useEffect(() => {
    setRecordable(canRecord());
    setFormat(pickFormat());
  }, []);

  const preset = SHAPES.find((s) => s.id === shape) ?? SHAPES[0];
  const shapeSpec = useMemo(() => {
    if (preset.id !== "auto") return { width: preset.width, height: preset.height };
    return detection ? autoSize(detection) : { width: 1920, height: 1080 };
  }, [preset, detection]);

  // ---- The plan -------------------------------------------------------
  const storyboard: Storyboard | null = useMemo(() => {
    if (!detection) return null;
    const kept = detection.panels.filter((p) => !excluded.has(p.id));
    if (kept.length === 0) return null;
    const usable: PanelDetection = { ...detection, panels: kept };
    const base = buildStoryboard(usable, {
      width: shapeSpec.width,
      height: shapeSpec.height,
      shotDurationMs,
      transitionMs,
      zoom,
      fit,
      background,
      // A contact sheet of separate photos is not a picture anyone made, so a
      // sequence never opens or closes on it.
      openWithEstablishingShot: wides && !isSequence,
      closeWithEstablishingShot: wides && !isSequence,
    });
    const frameAspect = shapeSpec.width / shapeSpec.height;
    return {
      ...base,
      shots: base.shots.map((shot) => {
        const panelId = panelIdOf(shot.id);
        const override = panelId ? moveOverrides[panelId] : undefined;
        const panel = panelId
          ? detection.panels.find((p) => p.id === panelId)
          : undefined;
        // The same framing rule buildStoryboard used, not a second copy of it.
        const framing =
          override && panel
            ? resolveMove(
                override,
                panel.bounds,
                cameraAspect(fit, frameAspect, panel.bounds),
                zoom,
              )
            : null;
        const name = panelId ? photoName(panelId) : null;
        return {
          ...shot,
          ...(name ? { label: name } : {}),
          ...(framing ? { from: framing.from, to: framing.to } : {}),
          caption: captions[shot.id] ?? "",
        };
      }),
    };
  }, [
    detection,
    excluded,
    moveOverrides,
    captions,
    shapeSpec,
    shotDurationMs,
    transitionMs,
    zoom,
    fit,
    background,
    wides,
    isSequence,
    photoName,
  ]);

  const duration = storyboard ? totalDurationMs(storyboard) : 0;
  const timings = useMemo(
    () => (storyboard ? shotTimings(storyboard) : []),
    [storyboard],
  );

  // A preview storyboard is the same plan at a smaller frame size.
  const previewBoard: Storyboard | null = useMemo(() => {
    if (!storyboard) return null;
    const scale = PREVIEW_WIDTH / storyboard.width;
    return {
      ...storyboard,
      width: Math.round(storyboard.width * scale),
      height: Math.round(storyboard.height * scale),
    };
  }, [storyboard]);

  // ---- Load ------------------------------------------------------------
  const reset = (): void => {
    setError(null);
    setResult(null);
    setPlaying(false);
    setPlayhead(0);
    setExcluded(new Set());
    setMoveOverrides({});
    setCaptions({});
  };

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    reset();
    try {
      const { drawable: bitmap, pixels } = await loadImage(file);
      const found = detectPanels({
        width: pixels.width,
        height: pixels.height,
        data: pixels.data,
      });
      setDrawable(bitmap);
      setSingle(found);
      setSequence(null);
      setOrder([]);
      setFileName(file.name);
    } catch (cause) {
      setDrawable(null);
      setSingle(null);
      setSequence(null);
      setFileName(null);
      setError(
        cause instanceof Error ? cause.message : "That image could not be read.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  /** Several photos, or more photos added to the ones already in the sequence. */
  const onPhotos = useCallback(
    async (
      files: readonly File[],
      keep: readonly { name: string; bitmap: ImageBitmap }[],
    ) => {
      setBusy(true);
      setError(null);
      setResult(null);
      setPlaying(false);
      setPlayhead(0);
      try {
        const room = DEFAULT_SEQUENCE_OPTIONS.maxPhotos - keep.length;
        if (files.length > room)
          throw new Error(
            `Up to ${DEFAULT_SEQUENCE_OPTIONS.maxPhotos} photos can go into one video` +
              (keep.length > 0 ? `, and ${keep.length} are already in.` : "."),
          );
        const added: { name: string; bitmap: ImageBitmap }[] = [];
        for (const file of files) {
          try {
            added.push({
              name: file.name,
              bitmap: await loadPhoto(file, DEFAULT_SEQUENCE_OPTIONS.maxEdge),
            });
          } catch {
            for (const photo of added) photo.bitmap.close();
            throw new Error(`${file.name} could not be read as a picture.`);
          }
        }
        const photos = [...keep, ...added];
        const layout = layoutSequence(
          photos.map((p) => ({ width: p.bitmap.width, height: p.bitmap.height })),
        );
        const sheet = await composeSheet(
          photos.map((p) => p.bitmap),
          layout,
        );
        setDrawable(sheet);
        setSingle(null);
        setSequence({ layout, photos });
        // New photos go on the end; whatever order was already chosen stays.
        setOrder((previous) => [
          ...(keep.length > 0 ? previous : []),
          ...added.map((_, i) => keep.length + i),
        ]);
        if (keep.length === 0) {
          setExcluded(new Set());
          setMoveOverrides({});
          setCaptions({});
        }
        setFileName(`${photos.length} photos`);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Those photos could not be read.",
        );
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const onChosen = useCallback(
    (list: FileList | null | undefined) => {
      const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) {
        if (list && list.length > 0) setError("None of those files is a picture.");
        return;
      }
      if (files.length === 1 && files[0]) void onFile(files[0]);
      else void onPhotos(files, []);
    },
    [onFile, onPhotos],
  );

  const reorder = (position: number, by: -1 | 1): void => {
    setPlaying(false);
    setOrder((previous) => {
      const next = [...previous];
      const other = position + by;
      const a = next[position];
      const b = next[other];
      if (a === undefined || b === undefined) return previous;
      next[position] = b;
      next[other] = a;
      return next;
    });
  };

  // ---- Panel map -------------------------------------------------------
  useEffect(() => {
    const canvas = panelsRef.current;
    if (!canvas || !drawable || !detection) return;
    const scale = PREVIEW_WIDTH / detection.source.width;
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.round(detection.source.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.font = "600 15px ui-sans-serif, system-ui, sans-serif";
    for (const panel of detection.panels) {
      const on = !excluded.has(panel.id);
      ctx.strokeStyle = on ? "#58a6ff" : "#6e7681";
      ctx.setLineDash(on ? [] : [7, 5]);
      ctx.strokeRect(
        panel.bounds.x * scale,
        panel.bounds.y * scale,
        panel.bounds.width * scale,
        panel.bounds.height * scale,
      );
      const label = String(panel.index + 1);
      ctx.fillStyle = on ? "#58a6ff" : "#6e7681";
      ctx.fillRect(panel.bounds.x * scale + 6, panel.bounds.y * scale + 6, 26, 22);
      ctx.fillStyle = "#0b0d10";
      ctx.fillText(label, panel.bounds.x * scale + 13, panel.bounds.y * scale + 22);
    }
    ctx.setLineDash([]);
  }, [drawable, detection, excluded]);

  // ---- Preview painting ------------------------------------------------
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !drawable || !previewBoard) return;
    canvas.width = previewBoard.width;
    canvas.height = previewBoard.height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    drawFrame(ctx, drawable, previewBoard, composeFrame(previewBoard, playhead));
  }, [drawable, previewBoard, playhead]);

  // ---- Preview playback ------------------------------------------------
  // The playhead is where playback RESUMES from, not something that should
  // restart the loop -- reading it through a ref keeps it out of the effect's
  // dependencies without silencing the linter.
  const playheadRef = useRef(0);
  useEffect(() => {
    playheadRef.current = playhead;
  }, [playhead]);

  useEffect(() => {
    if (!playing || duration <= 0) return;
    let raf = 0;
    const startedAt = performance.now() - playheadRef.current;
    const tick = (): void => {
      const t = performance.now() - startedAt;
      if (t >= duration) {
        setPlayhead(duration);
        setPlaying(false);
        return;
      }
      setPlayhead(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  useEffect(() => {
    return () => {
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  // ---- Record ----------------------------------------------------------
  const record = useCallback(async () => {
    const canvas = recordRef.current;
    if (!canvas || !drawable || !storyboard) return;
    setPlaying(false);
    setError(null);
    setResult(null);
    setRecordingProgress(0);
    try {
      const recording = await recordStoryboard({
        canvas,
        image: drawable,
        storyboard,
        onProgress: setRecordingProgress,
      });
      setResult({
        url: URL.createObjectURL(recording.blob),
        format: recording.format,
        size: recording.blob.size,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Recording failed.");
    } finally {
      setRecordingProgress(null);
    }
  }, [drawable, storyboard]);

  const downloadName = `${(isSequence ? "scene" : (fileName ?? "video")).replace(/\.[^.]+$/, "")}-video.${result?.format.extension ?? "webm"}`;

  return (
    <div>
      {/* ---- 1. The image ---- */}
      <Card
        title="1. Pick a picture, or several"
        sub="Nothing leaves this machine. Pictures are read in the browser and never uploaded."
      >
        <label
          style={{
            display: "block",
            border: "1px dashed #30363d",
            borderRadius: 10,
            padding: "22px 18px",
            textAlign: "center",
            cursor: "pointer",
            background: "#0d1117",
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onChosen(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              onChosen(e.target.files);
              e.target.value = "";
            }}
          />
          <strong style={{ fontSize: 14 }}>
            {fileName ?? "Choose a picture or several photos, or drag them here"}
          </strong>
          <div style={{ color: "#8b949e", fontSize: 12.5, marginTop: 4 }}>
            {busy
              ? "Reading the image…"
              : `PNG, JPEG or WebP. One comic page or storyboard, or up to ${DEFAULT_SEQUENCE_OPTIONS.maxPhotos} photos of a scene played in order.`}
          </div>
        </label>

        {sequence && sequence.photos.length < DEFAULT_SEQUENCE_OPTIONS.maxPhotos ? (
          <label style={{ ...buttonStyle, display: "inline-block", marginTop: 12 }}>
            <input
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).filter((f) =>
                  f.type.startsWith("image/"),
                );
                e.target.value = "";
                if (files.length > 0) void onPhotos(files, sequence.photos);
              }}
            />
            Add more photos
          </label>
        ) : null}

        {error ? (
          <p style={{ color: "#f85149", fontSize: 13, marginBottom: 0 }}>{error}</p>
        ) : null}
      </Card>

      {/* ---- 2. Panels ---- */}
      {detection && drawable ? (
        <Card title="2. What it found" sub={detection.note}>
          <canvas
            ref={panelsRef}
            style={{
              width: "100%",
              maxWidth: PREVIEW_WIDTH,
              borderRadius: 8,
              display: "block",
            }}
          />
          {detection.panels.length > 1 ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              {detection.panels.map((panel, position) => {
                const on = !excluded.has(panel.id);
                const toggle = (
                  <button
                    key={panel.id}
                    type="button"
                    title={on ? "Click to skip this one" : "Click to put it back"}
                    onClick={() =>
                      setExcluded((previous) => {
                        const next = new Set(previous);
                        if (next.has(panel.id)) next.delete(panel.id);
                        else next.add(panel.id);
                        return next;
                      })
                    }
                    style={{
                      background: on ? "#1f6feb" : "#161b22",
                      color: on ? "#fff" : "#8b949e",
                      border: "1px solid " + (on ? "#1f6feb" : "#30363d"),
                      borderRadius: 7,
                      padding: "5px 11px",
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    {isSequence
                      ? `${position + 1}. ${photoName(panel.id) ?? "Photo"}`
                      : `Panel ${panel.index + 1}`}
                    {on ? "" : " — skipped"}
                  </button>
                );
                if (!isSequence) return toggle;
                const last = position === detection.panels.length - 1;
                return (
                  <span
                    key={panel.id}
                    style={{ display: "inline-flex", gap: 3, alignItems: "center" }}
                  >
                    <button
                      type="button"
                      aria-label="Play earlier"
                      disabled={position === 0}
                      onClick={() => reorder(position, -1)}
                      style={arrowStyle(position === 0)}
                    >
                      ←
                    </button>
                    {toggle}
                    <button
                      type="button"
                      aria-label="Play later"
                      disabled={last}
                      onClick={() => reorder(position, 1)}
                      style={arrowStyle(last)}
                    >
                      →
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ---- 3. Settings ---- */}
      {storyboard ? (
        <Card
          title="3. How it should look"
          sub={`${storyboard.shots.length} shots, ${seconds(duration)} long, ${storyboard.fps} frames a second.`}
        >
          <div
            style={{
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <Field label={`Shape — ${shapeSpec.width} x ${shapeSpec.height}`}>
              <select
                value={shape}
                onChange={(e) => setShape(e.target.value as ShapeId)}
                style={selectStyle}
              >
                {SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Framing">
              <select
                value={fit}
                onChange={(e) => setFit(e.target.value as FitMode)}
                style={selectStyle}
              >
                <option value="contain">
                  Show the whole {isSequence ? "photo" : "panel"}
                </option>
                <option value="fill">Fill the frame (crops)</option>
              </select>
            </Field>
            <Field label="Background">
              <select
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                style={selectStyle}
              >
                {BACKGROUNDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </Field>
            <Slider
              label={`Time per ${isSequence ? "photo" : "panel"} — ${seconds(shotDurationMs)}`}
              min={800}
              max={6000}
              step={100}
              value={shotDurationMs}
              onChange={setShotDurationMs}
            />
            <Slider
              label={`Crossfade — ${seconds(transitionMs)}`}
              min={0}
              max={1200}
              step={20}
              value={transitionMs}
              onChange={setTransitionMs}
            />
            <Slider
              label={`Zoom depth — ${Math.round((1 - zoom) * 100)}%`}
              min={60}
              max={100}
              step={1}
              value={Math.round(zoom * 100)}
              onChange={(v) => setZoom(v / 100)}
            />
            {isSequence ? null : (
              <label
                style={{ fontSize: 13, display: "flex", gap: 7, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={wides}
                  onChange={(e) => setWides(e.target.checked)}
                />
                Open and close on the whole page
              </label>
            )}
          </div>
        </Card>
      ) : null}

      {/* ---- 4. Preview ---- */}
      {storyboard && previewBoard ? (
        <Card
          title="4. Watch it"
          sub="This is exactly what gets recorded — same plan, smaller frame."
        >
          <canvas
            ref={previewRef}
            style={{
              width: "100%",
              maxWidth: PREVIEW_WIDTH,
              borderRadius: 8,
              display: "block",
              background: "#000",
            }}
          />
          <div
            style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}
          >
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              style={buttonStyle}
            >
              {playing ? "Pause" : playhead >= duration ? "Play again" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              value={Math.round(playhead)}
              onChange={(e) => {
                setPlaying(false);
                setPlayhead(Number(e.target.value));
              }}
              style={{ flex: 1 }}
              aria-label="Scrub the preview"
            />
            <span
              style={{
                fontSize: 12.5,
                color: "#8b949e",
                minWidth: 82,
                textAlign: "right",
              }}
            >
              {seconds(playhead)} / {seconds(duration)}
            </span>
          </div>
        </Card>
      ) : null}

      {/* ---- 5. Shot list ---- */}
      {storyboard ? (
        <Card
          title="5. The shot list"
          sub="Change the camera move, or add a caption that gets burned into the video."
        >
          <div style={{ display: "grid", gap: 8 }}>
            {storyboard.shots.map((shot, index) => {
              const panelId = panelIdOf(shot.id);
              const timing = timings[index];
              return (
                <div
                  key={shot.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    background: "#0d1117",
                    border: "1px solid #21262d",
                    borderRadius: 8,
                    padding: "8px 11px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      minWidth: 78,
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={shot.label}
                  >
                    {shot.label}
                  </span>
                  <span style={{ fontSize: 12, color: "#8b949e", minWidth: 96 }}>
                    {timing
                      ? `${seconds(timing.startMs)} – ${seconds(timing.endMs)}`
                      : ""}
                  </span>
                  {panelId ? (
                    <select
                      value={
                        moveOverrides[panelId] ??
                        defaultMoveLabel(
                          shot.from.width,
                          shot.to.width,
                          shot.from.x,
                          shot.to.x,
                        )
                      }
                      onChange={(e) =>
                        setMoveOverrides((previous) => ({
                          ...previous,
                          [panelId]: e.target.value as CameraMove,
                        }))
                      }
                      style={selectStyle}
                    >
                      {MOVES.map((move) => (
                        <option key={move} value={move}>
                          {move}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12, color: "#8b949e", width: 120 }}>
                      wide
                    </span>
                  )}
                  <input
                    type="text"
                    placeholder="Caption (optional)"
                    value={captions[shot.id] ?? ""}
                    onChange={(e) =>
                      setCaptions((previous) => ({
                        ...previous,
                        [shot.id]: e.target.value,
                      }))
                    }
                    style={{
                      flex: 1,
                      minWidth: 180,
                      background: "#010409",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      color: "#e8eaed",
                      padding: "6px 9px",
                      fontSize: 13,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* ---- 6. Record ---- */}
      {storyboard ? (
        <Card
          title="6. Make the video file"
          sub={
            recordable === false
              ? "This browser cannot record video from a canvas."
              : `Records in real time — about ${seconds(duration)}. Keep this tab in front while it runs.`
          }
        >
          {recordable === false ? (
            <p style={{ fontSize: 13, color: "#d29922", margin: 0 }}>
              No recording button is shown because this browser has no working
              MediaRecorder for canvas video. Chrome or Edge will do it. Everything
              above still works.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void record()}
                disabled={recordingProgress !== null}
                style={{
                  ...buttonStyle,
                  background: recordingProgress !== null ? "#21262d" : "#238636",
                  borderColor: recordingProgress !== null ? "#30363d" : "#2ea043",
                  cursor: recordingProgress !== null ? "default" : "pointer",
                }}
              >
                {recordingProgress !== null
                  ? `Recording… ${Math.round(recordingProgress * 100)}%`
                  : `Record ${format?.label ?? "video"}`}
              </button>
              {recordingProgress !== null ? (
                <div
                  style={{
                    height: 6,
                    background: "#21262d",
                    borderRadius: 999,
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      height: 6,
                      width: `${Math.round(recordingProgress * 100)}%`,
                      background: "#2ea043",
                      borderRadius: 999,
                    }}
                  />
                </div>
              ) : null}
            </>
          )}

          {result ? (
            <div style={{ marginTop: 16 }}>
              <video
                src={result.url}
                controls
                style={{
                  width: "100%",
                  maxWidth: PREVIEW_WIDTH,
                  borderRadius: 8,
                  display: "block",
                }}
              />
              <p style={{ fontSize: 13, margin: "10px 0 0" }}>
                <a
                  href={result.url}
                  download={downloadName}
                  style={{ color: "#58a6ff" }}
                >
                  Download {downloadName}
                </a>{" "}
                <span style={{ color: "#8b949e" }}>
                  — {result.format.label}, {(result.size / 1_000_000).toFixed(1)} MB
                </span>
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <canvas ref={recordRef} style={{ display: "none" }} />
    </div>
  );
}

/** Which move a shot's geometry corresponds to, for the dropdown's initial value. */
function defaultMoveLabel(
  fromWidth: number,
  toWidth: number,
  fromX: number,
  toX: number,
): CameraMove {
  if (toWidth < fromWidth - 0.5) return "push-in";
  if (toWidth > fromWidth + 0.5) return "pull-out";
  if (toX > fromX + 0.5) return "pan-right";
  if (toX < fromX - 0.5) return "pan-left";
  return "hold";
}

const buttonStyle: React.CSSProperties = {
  background: "#1f6feb",
  border: "1px solid #388bfd",
  color: "#fff",
  borderRadius: 7,
  padding: "8px 16px",
  fontSize: 13.5,
  cursor: "pointer",
};

const arrowStyle = (disabled: boolean): React.CSSProperties => ({
  background: "#161b22",
  border: "1px solid #30363d",
  color: disabled ? "#30363d" : "#8b949e",
  borderRadius: 6,
  padding: "4px 7px",
  fontSize: 12.5,
  cursor: disabled ? "default" : "pointer",
});

const selectStyle: React.CSSProperties = {
  background: "#010409",
  border: "1px solid #30363d",
  color: "#e8eaed",
  borderRadius: 6,
  padding: "6px 9px",
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 12.5, color: "#8b949e", display: "grid", gap: 5 }}>
      {label}
      {children}
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label
      style={{
        fontSize: 12.5,
        color: "#8b949e",
        display: "grid",
        gap: 5,
        minWidth: 180,
      }}
    >
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "#12151a",
        border: "1px solid #262c36",
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 16,
      }}
    >
      <h2 style={{ margin: "0 0 2px", fontSize: 15, letterSpacing: 0.2 }}>{title}</h2>
      {sub ? (
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "#8b949e" }}>{sub}</p>
      ) : null}
      {children}
    </section>
  );
}
