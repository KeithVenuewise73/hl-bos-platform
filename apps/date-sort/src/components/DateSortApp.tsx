"use client";

import { useEffect, useRef, useState } from "react";

import {
  FORMAT_LABEL,
  PHOTO_FORMATS,
  type DayReport,
  type FormatCounts,
} from "@hl-bos/date-sort";

import { clockTime, count, dateAndTime, longDate } from "@/lib/format.ts";
import type { ScanMessage, ScanView } from "@/lib/scan-view.ts";

type Progress = { phase: "listing" | "reading"; found: number; read: number };

const REMEMBER = "datesort.source";

function remembered(): { folder: string; includeSubfolders: boolean } | null {
  try {
    const raw = window.localStorage.getItem(REMEMBER);
    return raw === null
      ? null
      : (JSON.parse(raw) as { folder: string; includeSubfolders: boolean });
  } catch {
    return null;
  }
}

function remember(folder: string, includeSubfolders: boolean) {
  try {
    window.localStorage.setItem(
      REMEMBER,
      JSON.stringify({ folder, includeSubfolders }),
    );
  } catch {
    // a browser that will not remember is fine; the field is just empty next time
  }
}

export function DateSortApp() {
  const [folder, setFolder] = useState("");
  const [includeSubfolders, setIncludeSubfolders] = useState(true);
  const [browsing, setBrowsing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [view, setView] = useState<ScanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const r = remembered();
    if (r !== null) {
      setFolder(r.folder);
      setIncludeSubfolders(r.includeSubfolders);
    }
  }, []);

  async function browse() {
    setBrowsing(true);
    setNote("A Windows folder window has opened. Choose the folder with your photos.");
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const out = (await res.json()) as
        | { kind: "picked"; path: string }
        | { kind: "cancelled" }
        | { kind: "busy" }
        | { kind: "failed" | "unavailable"; reason: string }
        | { error: string };
      if ("error" in out) setNote(out.error);
      else if (out.kind === "picked") {
        setFolder(out.path);
        setNote(null);
      } else if (out.kind === "cancelled") setNote(null);
      else if (out.kind === "busy")
        setNote(
          "The folder window is already open. It may be behind this browser window.",
        );
      else setNote(out.reason);
    } catch {
      setNote("DateSort did not answer. Is its window still open?");
    } finally {
      setBrowsing(false);
    }
  }

  async function scan() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setScanning(true);
    setError(null);
    setView(null);
    setProgress({ phase: "listing", found: 0, read: 0 });
    remember(folder, includeSubfolders);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, includeSubfolders }),
        signal: controller.signal,
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setError(out.error ?? "The scan could not start.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, nl);
          buffered = buffered.slice(nl + 1);
          if (line.trim() === "") continue;
          const m = JSON.parse(line) as ScanMessage;
          if (m.type === "progress")
            setProgress({ phase: m.phase, found: m.found, read: m.read });
          else if (m.type === "done") setView(m.view);
          else setError(m.message);
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(
          `The scan stopped: ${e instanceof Error ? e.message : String(e)}. Nothing in the folder was changed.`,
        );
      }
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-2xl text-brand">DateSort</h1>
          <p className="text-sm text-muted">
            Loose camera photos, grouped by the day they were taken.
          </p>
        </div>
      </header>

      <section className="card space-y-4 p-5">
        <label
          className="block text-xs font-semibold uppercase tracking-wide text-muted"
          htmlFor="source"
        >
          Folder with your photos
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="source"
            data-testid="source-input"
            className="input font-mono"
            placeholder="D:\Camera\Unsorted"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            data-testid="browse-button"
            className="btn-ghost shrink-0"
            onClick={() => void browse()}
            disabled={browsing || scanning}
          >
            {browsing ? "Waiting for the folder window…" : "Browse…"}
          </button>
        </div>
        {note !== null ? (
          <p className="text-sm text-estimate" data-testid="browse-note">
            {note}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="include-subfolders"
              className="h-4 w-4 accent-[var(--color-brand)]"
              checked={includeSubfolders}
              onChange={(e) => setIncludeSubfolders(e.target.checked)}
            />
            Include subfolders
          </label>
          <button
            type="button"
            data-testid="scan-button"
            className="btn-primary min-w-32"
            onClick={() => void scan()}
            disabled={scanning || folder.trim() === ""}
          >
            {scanning ? "Scanning…" : "Scan"}
          </button>
        </div>
        <p className="text-xs text-muted" data-testid="read-only-note">
          Scanning only reads. Nothing in this folder is moved, renamed, edited or
          deleted, and nothing is created inside it.
        </p>
      </section>

      {progress !== null ? (
        <section className="card p-5" data-testid="scan-progress">
          <p className="text-sm">
            {progress.phase === "listing"
              ? `Finding files… ${count(progress.found, "file")} so far`
              : `Reading dates… ${progress.read.toLocaleString("en-US")} of ${count(progress.found, "file")}`}
          </p>
          {progress.phase === "reading" && progress.found > 0 ? (
            <div className="mt-3 h-2 overflow-hidden rounded bg-panel-2">
              <div
                className="h-full bg-brand transition-all"
                style={{
                  width: `${Math.round((progress.read / progress.found) * 100)}%`,
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {error !== null ? (
        <section
          className="card border-bad/60 p-5 text-sm text-bad"
          data-testid="scan-error"
        >
          {error}
        </section>
      ) : null}

      {view !== null ? <Report view={view} /> : null}
    </div>
  );
}

function Stat({
  id,
  label,
  value,
  tone,
}: {
  id: string;
  label: string;
  value: string | number;
  tone?: "estimate" | "bad" | undefined;
}) {
  const colour =
    tone === "estimate" ? "text-estimate" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`text-xl font-semibold ${colour}`} data-testid={`stat-${id}`}>
        {typeof value === "number" ? value.toLocaleString("en-US") : value}
      </div>
    </div>
  );
}

function formatLine(byFormat: FormatCounts): string {
  return PHOTO_FORMATS.filter((f) => byFormat[f] > 0)
    .map((f) => `${byFormat[f].toLocaleString("en-US")} ${FORMAT_LABEL[f]}`)
    .join(" · ");
}

function Report({ view }: { view: ScanView }) {
  const r = view.report;
  const [showEstimated, setShowEstimated] = useState(false);
  const [showUnsupported, setShowUnsupported] = useState(false);
  return (
    <section className="space-y-5" data-testid="scan-report">
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-lg">Scan complete</h2>
          <p className="text-xs text-muted">
            <span className="font-mono">{view.root}</span>
            {view.includeSubfolders
              ? " and its subfolders"
              : " (this folder only)"} · {view.seconds.toFixed(1)} s · nothing was
            changed
          </p>
        </div>
        <p className="text-2xl font-semibold" data-testid="headline">
          {count(r.photos, "photo")} · {count(r.days.length, "shooting date")}
        </p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Stat id="total" label="Files scanned" value={r.totalFiles} />
          <Stat id="photos" label="Photos" value={r.photos} />
          <Stat id="jpeg" label="JPG / JPEG" value={r.byFormat.jpeg} />
          <Stat id="png" label="PNG" value={r.byFormat.png} />
          <Stat id="heic" label="HEIC" value={r.byFormat.heic} />
          <Stat id="cr2" label="Canon CR2" value={r.byFormat.cr2} />
          <Stat id="cr3" label="Canon CR3" value={r.byFormat.cr3} />
          <Stat
            id="unsupported"
            label="Not photos"
            value={r.unsupported.length}
            tone={r.unsupported.length > 0 ? "bad" : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat id="dates" label="Shooting dates" value={r.days.length} />
          <Stat id="camera" label="Camera (EXIF) dates" value={r.cameraDated} />
          <Stat
            id="estimated"
            label="Estimated dates"
            value={r.estimated}
            tone={r.estimated > 0 ? "estimate" : undefined}
          />
          <Stat
            id="undated"
            label="No date at all"
            value={r.undated.length}
            tone={r.undated.length > 0 ? "bad" : undefined}
          />
        </div>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-muted">Earliest photo: </dt>
            <dd className="inline" data-testid="earliest">
              {r.earliest === null ? "—" : dateAndTime(r.earliest)}
              {r.earliestIsEstimate ? <EstimateTag /> : null}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted">Latest photo: </dt>
            <dd className="inline" data-testid="latest">
              {r.latest === null ? "—" : dateAndTime(r.latest)}
              {r.latestIsEstimate ? <EstimateTag /> : null}
            </dd>
          </div>
        </dl>
        {r.estimated > 0 ? (
          <p className="text-sm text-estimate" data-testid="estimate-explainer">
            {`${count(r.estimated, "photo has", "photos have")} no camera date, so ${r.estimated === 1 ? "its" : "their"} date is estimated from the file's Date Modified — usually when it was last copied or edited, not when it was taken. Each one is `}
            labelled <EstimateTag inline />.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Every dated photo is dated by its camera. Estimated dates: 0.
          </p>
        )}
      </div>

      {r.days.length === 0 ? (
        <p className="card p-5 text-sm text-muted" data-testid="no-dates">
          No photos with a date were found in this folder
          {view.includeSubfolders
            ? " or its subfolders"
            : ". If they are in subfolders, tick Include subfolders and scan again"}
          .
        </p>
      ) : (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="date-cards"
        >
          {r.days.map((d) => (
            <DateCard key={d.day} day={d} />
          ))}
        </div>
      )}

      {view.estimated.length > 0 ? (
        <div className="card p-5">
          <button
            type="button"
            className="text-sm font-semibold text-estimate"
            onClick={() => setShowEstimated((s) => !s)}
          >
            {showEstimated ? "Hide" : "Show"} the{" "}
            {count(view.estimated.length, "photo")} with an estimated date
          </button>
          {showEstimated ? (
            <ul className="mt-3 space-y-1 text-sm" data-testid="estimated-list">
              {view.estimated.map((e) => (
                <li key={e.path} className="flex flex-wrap gap-x-3">
                  <span className="font-mono text-muted">{e.path}</span>
                  <span>
                    {dateAndTime(e.takenAt)} <EstimateTag />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {r.unsupported.length +
        r.undated.length +
        view.folderProblems.length +
        view.skippedLinks.length >
      0 ? (
        <div className="card p-5">
          <button
            type="button"
            className="text-sm font-semibold text-muted"
            onClick={() => setShowUnsupported((s) => !s)}
          >
            {showUnsupported ? "Hide" : "Show"} files and folders DateSort did not use
          </button>
          {showUnsupported ? (
            <ul className="mt-3 space-y-1 text-sm" data-testid="unsupported-list">
              {r.unsupported.map((u) => (
                <li key={u.path}>
                  <span className="font-mono text-muted">{u.path}</span> — {u.reason}
                </li>
              ))}
              {r.undated.map((u) => (
                <li key={u.path}>
                  <span className="font-mono text-muted">{u.path}</span> — a photo with
                  no camera date and no usable file date
                </li>
              ))}
              {view.folderProblems.map((p) => (
                <li key={`folder:${p.path}`}>
                  <span className="font-mono text-muted">
                    {p.path === "" ? view.root : p.path}
                  </span>{" "}
                  — folder could not be opened: {p.reason}
                </li>
              ))}
              {view.skippedLinks.map((l) => (
                <li key={`link:${l}`}>
                  <span className="font-mono text-muted">{l}</span> — a shortcut to
                  another folder; not followed
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EstimateTag({ inline = false }: { inline?: boolean }) {
  return (
    <span
      className={`${inline ? "" : "ml-2 "}inline-block rounded border border-estimate/60 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-estimate`}
      data-testid="estimate-tag"
    >
      Estimated date
    </span>
  );
}

function DateCard({ day }: { day: DayReport }) {
  return (
    <article className="card space-y-3 p-5" data-testid="date-card" data-day={day.day}>
      <h3 className="display text-base text-brand">{longDate(day.day)}</h3>
      <p className="text-2xl font-semibold" data-col="photos">
        {count(day.photos, "photo")}
      </p>
      <p className="text-sm text-muted" data-col="formats">
        {formatLine(day.byFormat)}
      </p>
      <dl className="space-y-1 text-sm">
        <div>
          <dt className="inline text-muted">First photo: </dt>
          <dd className="inline" data-col="first">
            {clockTime(day.first)}
            {day.firstIsEstimate ? <EstimateTag /> : null}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted">Last photo: </dt>
          <dd className="inline" data-col="last">
            {clockTime(day.last)}
            {day.lastIsEstimate ? <EstimateTag /> : null}
          </dd>
        </div>
      </dl>
      <p className="border-t border-line pt-3 text-sm">
        <span data-col="camera">{count(day.cameraDated, "camera date")}</span>
        <span className="text-muted"> · </span>
        <span
          data-col="estimated"
          className={day.estimated > 0 ? "text-estimate" : "text-muted"}
        >
          {count(day.estimated, "estimated date")}
        </span>
      </p>
    </article>
  );
}
