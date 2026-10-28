"use client";

import { useEffect, useRef, useState } from "react";

import { folderName } from "@hl-bos/date-sort";

import { copyHealth } from "@/lib/copy-watch.ts";
import { count, longDate } from "@/lib/format.ts";
import type { CopyMessage, DayCopyView, ScanView } from "@/lib/scan-view.ts";

type Progress = Extract<CopyMessage, { type: "progress" }>;

const gb = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/** Everything Create Folder needs, shared by the panel and the date cards. */
export function useCopy(view: ScanView) {
  const [destination, setDestination] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [results, setResults] = useState<Record<string, DayCopyView>>({});
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [awake, setAwake] = useState<boolean | null>(null);
  /** What to copy: hockey videos can go to their own folder. */
  const [only, setOnly] = useState<"both" | "photos" | "videos">("both");
  const [stalled, setStalled] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/settings", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then(
        (s: { destination?: string | null; eventNames?: Record<string, string> }) => {
          if (s.destination) setDestination(s.destination);
          // Names typed before a refresh or restart (settings.ts).
          if (s.eventNames) setNames((n) => ({ ...s.eventNames, ...n }));
        },
      )
      .catch(() => undefined);
  }, []);

  async function rememberDestination(path: string) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: path }),
    }).catch(() => undefined);
  }

  async function rememberNames(all: Record<string, string> = names) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventNames: all }),
    }).catch(() => undefined);
  }

  async function browse() {
    setBrowsing(true);
    setNote(
      "A Windows folder window has opened. Choose where the date folders should go.",
    );
    try {
      const res = await fetch("/api/browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "destination" }),
      });
      const out = (await res.json()) as {
        kind?: string;
        path?: string;
        reason?: string;
        error?: string;
      };
      if (out.kind === "picked" && out.path) {
        setDestination(out.path);
        await rememberDestination(out.path);
        setNote(null);
      } else if (out.kind === "cancelled") setNote(null);
      else if (out.kind === "busy")
        setNote(
          "The folder window is already open. It may be behind this browser window.",
        );
      else setNote(out.reason ?? out.error ?? "The folder window could not be opened.");
    } catch {
      setNote("DateSort did not answer. Is its window still open?");
    } finally {
      setBrowsing(false);
    }
  }

  async function run(days: string[]) {
    if (destination.trim() === "") {
      setError(
        "No folder is chosen yet. Click Browse… and pick one. To make a new folder (for example 5-Star Sports Media), click New folder in that window, name it, then select it.",
      );
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(days);
    setError(null);
    setProgress(null);
    setAwake(null);
    setStalled(false);
    await rememberDestination(destination.trim());
    await rememberNames();
    let lastMessageAt = Date.now();
    let lastPhotoAt = Date.now();
    let lastDone = -1;
    let lost = false;
    const watch = setInterval(() => {
      const health = copyHealth(Date.now(), lastMessageAt, lastPhotoAt);
      setStalled(health === "stalled");
      if (health === "lost") {
        lost = true;
        controller.abort();
      }
    }, 2_000);
    try {
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: view.scanId,
          destination: destination.trim(),
          days: days.map((day) => ({ day, eventName: names[day] ?? "" })),
          ...(only === "both" ? {} : { only }),
        }),
        signal: controller.signal,
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setError(out.error ?? "The copy could not start.");
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
          const m = JSON.parse(line) as CopyMessage;
          lastMessageAt = Date.now();
          if (m.type === "alive") continue;
          if (m.type === "progress") {
            if (m.done !== lastDone) {
              lastDone = m.done;
              lastPhotoAt = lastMessageAt;
            }
            setProgress(m);
          } else if (m.type === "awake") setAwake(m.held);
          else if (m.type === "done")
            setResults((prev) => {
              const next = { ...prev };
              for (const d of m.days) next[d.day] = d;
              return next;
            });
          else setError(m.message);
        }
      }
    } catch {
      if (controller.signal.aborted && !lost) {
        setError(
          "Stopped. Everything copied so far is complete and checked; press the button again to finish the rest.",
        );
      } else {
        setError(
          "The copy was interrupted: DateSort lost touch with this page (this happens if the laptop went to sleep or DateSort's window was closed). Every photo copied so far is complete and checked, and your originals were not touched. Press the button again to finish the rest.",
        );
      }
    } finally {
      clearInterval(watch);
      setStalled(false);
      setRunning(null);
      setProgress(null);
    }
  }

  return {
    destination,
    setDestination,
    names,
    setName: (day: string, name: string) => setNames((n) => ({ ...n, [day]: name })),
    saveNames: () => void rememberNames(),
    /** Set several event names at once and remember them (sport suggestions). */
    applyNames: (changes: Record<string, string>) => {
      const next = { ...names, ...changes };
      setNames(next);
      void rememberNames(next);
    },
    browse,
    browsing,
    note,
    run,
    running,
    progress,
    awake,
    only,
    setOnly,
    stalled,
    results,
    error,
    cancel: () => abort.current?.abort(),
  };
}

export type CopyState = ReturnType<typeof useCopy>;

/** The panel above the date cards: destination, Copy all, progress. */
export function CopyPanel({ view, copy }: { view: ScanView; copy: CopyState }) {
  const days = view.report.days;
  const photos = days.reduce((n, d) => n + d.photos, 0);
  const busy = copy.running !== null;
  return (
    <section className="card space-y-4 p-5" data-testid="copy-panel">
      <div>
        <h2 className="display text-lg">Copy to dated folders</h2>
        <p className="text-sm text-muted">
          One folder per shooting date, named like{" "}
          <span className="font-mono">2026-10-04</span>, or{" "}
          <span className="font-mono">2026-10-04 - Caz vs Wheatfield</span> if you type
          an event name on its card. Photos are{" "}
          <strong className="text-text">copied</strong>: your originals stay exactly
          where they are, untouched, and nothing in the destination is ever overwritten.
        </p>
      </div>
      {view.report.byFormat.mov + view.report.byFormat.mp4 > 0 ? (
        <fieldset className="space-y-1" data-testid="copy-only">
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">
            What to copy
          </legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["both", "Photos and videos"],
                ["photos", "Photos only"],
                ["videos", "Videos only"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="copy-only"
                  value={value}
                  data-testid={`copy-only-${value}`}
                  checked={copy.only === value}
                  disabled={busy}
                  onChange={() => copy.setOnly(value)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            Videos only: choose your video folder below (Hockey Videos, say). Dates with
            nothing of that kind get no folder.
          </p>
        </fieldset>
      ) : null}
      <label
        className="block text-xs font-semibold uppercase tracking-wide text-muted"
        htmlFor="destination"
      >
        Put the date folders in
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="destination"
          data-testid="destination-input"
          className="input font-mono"
          // Not an example path: an example that looks like a real folder was
          // mistaken for a chosen one.
          placeholder="No folder chosen yet. Click Browse…"
          value={copy.destination}
          onChange={(e) => copy.setDestination(e.target.value)}
          disabled={busy}
          spellCheck={false}
        />
        <button
          type="button"
          data-testid="destination-browse"
          className="btn-ghost shrink-0"
          onClick={() => void copy.browse()}
          disabled={copy.browsing || busy}
        >
          {copy.browsing ? "Waiting for the folder window…" : "Browse…"}
        </button>
      </div>
      {copy.note !== null ? <p className="text-sm text-estimate">{copy.note}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {count(days.length, "date")} · {count(photos, "photo")}
        </p>
        {busy ? (
          <button
            type="button"
            className="btn-ghost"
            data-testid="copy-cancel"
            onClick={copy.cancel}
          >
            Stop copying
          </button>
        ) : (
          <button
            type="button"
            data-testid="copy-all"
            className="btn-primary"
            disabled={days.length === 0}
            onClick={() => {
              if (copy.destination.trim() === "") {
                void copy.run([]); // shows the "no folder chosen" message
              } else if (
                window.confirm(
                  `Copy ${count(photos, "photo")} into ${count(days.length, "dated folder")} in\n${copy.destination}?\n\nYour originals are not moved or changed.`,
                )
              ) {
                void copy.run(days.map((d) => d.day));
              }
            }}
          >
            Copy all {count(days.length, "date")}
          </button>
        )}
      </div>
      {copy.progress !== null ? (
        <div data-testid="copy-progress">
          <p className="text-sm">
            Copying {longDate(copy.progress.day)} into{" "}
            <span className="font-mono">
              {copy.progress.folder.split(/[\\/]/).pop()}
            </span>
            … {copy.progress.done.toLocaleString("en-US")} of{" "}
            {count(copy.progress.total, "photo")} · {gb(copy.progress.bytesCopied)}{" "}
            copied
            {copy.progress.alreadyThere > 0
              ? ` · ${copy.progress.alreadyThere.toLocaleString("en-US")} already there, skipped`
              : ""}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-panel-2">
            <div
              className="h-full bg-brand transition-all"
              style={{
                width: `${Math.round((copy.progress.done / Math.max(1, copy.progress.total)) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : busy ? (
        <p className="text-sm">Checking the destination…</p>
      ) : null}
      {busy && copy.stalled ? (
        <p className="text-sm text-estimate" data-testid="copy-stalled">
          No photo has finished copying in the last 2 minutes. If the photo drive was
          unplugged or the laptop went to sleep, press Stop copying, then Copy all
          again: everything copied so far is kept and skipped.
        </p>
      ) : null}
      {busy && copy.awake !== null ? (
        <p className="text-xs text-muted" data-testid="copy-awake">
          {copy.awake
            ? "This laptop will not go to sleep until the copy finishes. Keep the lid open: closing it still puts Windows to sleep."
            : "Windows could not be kept awake for this copy. Keep the laptop awake and the lid open until it finishes; if it does sleep, press the button again to finish the rest."}
        </p>
      ) : null}
      {copy.error !== null ? (
        <p className="text-sm text-bad" data-testid="copy-error">
          {copy.error}
        </p>
      ) : null}
      {Object.keys(copy.results).length > 0 && !busy ? (
        <CopySummary results={copy.results} />
      ) : null}
    </section>
  );
}

function CopySummary({ results }: { results: Record<string, DayCopyView> }) {
  const all = Object.values(results);
  const sum = (k: "copied" | "alreadyThere") => all.reduce((n, r) => n + r[k], 0);
  const conflicts = all.flatMap((r) =>
    r.conflicts.map((c) => ({ ...c, folder: r.folder })),
  );
  const failed = all.flatMap((r) => r.failed.map((c) => ({ ...c, folder: r.folder })));
  const problems = all.filter((r) => r.problem !== null);
  const renamed = all.filter((r) => r.renamedFrom !== null);
  return (
    <div
      className="space-y-2 border-t border-line pt-3 text-sm"
      data-testid="copy-summary"
    >
      <p>
        <span data-testid="sum-copied">{count(sum("copied"), "photo")} copied</span> ·{" "}
        <span data-testid="sum-already">
          {sum("alreadyThere").toLocaleString("en-US")} already there
        </span>{" "}
        ·{" "}
        <span
          data-testid="sum-conflicts"
          className={conflicts.length > 0 ? "text-estimate" : ""}
        >
          {conflicts.length.toLocaleString("en-US")} left alone (different file, same
          name)
        </span>{" "}
        ·{" "}
        <span data-testid="sum-failed" className={failed.length > 0 ? "text-bad" : ""}>
          {failed.length.toLocaleString("en-US")} could not be copied
        </span>
      </p>
      {renamed.length > 0 ? (
        <p className="text-muted" data-testid="sum-renamed">
          {count(renamed.length, "date folder")} renamed to match the event name.
        </p>
      ) : null}
      {problems.length > 0 ? (
        <ul className="space-y-1 text-bad" data-testid="sum-problems">
          {problems.map((r) => (
            <li key={r.day}>
              {longDate(r.day)}: {r.problem}
            </li>
          ))}
        </ul>
      ) : null}
      {conflicts.length + failed.length > 0 ? (
        <ul className="space-y-1">
          {[...conflicts, ...failed].slice(0, 50).map((c) => (
            <li key={`${c.folder}/${c.name}`}>
              <span className="font-mono text-muted">{c.source}</span> — {c.reason}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The Create Folder part of one date card. */
export function CardCopy({ day, copy }: { day: string; copy: CopyState }) {
  const name = copy.names[day] ?? "";
  const result = copy.results[day];
  const busy = copy.running !== null;
  const mine = copy.running?.includes(day) ?? false;
  let folder = day;
  try {
    folder = folderName(day, name);
  } catch {
    // a malformed date never reaches here; keep the plain date
  }
  return (
    <div className="space-y-2 border-t border-line pt-3" data-testid="card-copy">
      <input
        className="input"
        data-testid="event-name"
        placeholder="Event name (optional), e.g. Caz vs Wheatfield"
        value={name}
        onChange={(e) => copy.setName(day, e.target.value)}
        onBlur={copy.saveNames}
        disabled={busy}
      />
      <p
        className="truncate font-mono text-xs text-muted"
        data-testid="folder-preview"
        title={folder}
      >
        📁 {folder}
      </p>
      <button
        type="button"
        data-testid="create-folder"
        className="btn-ghost w-full"
        disabled={busy}
        onClick={() => void copy.run([day])}
      >
        {mine
          ? "Copying…"
          : result
            ? "Copy again (finishes anything missing)"
            : "Create folder & copy photos"}
      </button>
      {result ? (
        <p className="text-xs" data-testid="card-result">
          <span className="text-brand">
            {result.copied.toLocaleString("en-US")} copied
          </span>
          {` · ${result.alreadyThere.toLocaleString("en-US")} already there`}
          {result.conflicts.length > 0 ? (
            <span className="text-estimate">{` · ${result.conflicts.length} left alone`}</span>
          ) : null}
          {result.failed.length > 0 ? (
            <span className="text-bad">{` · ${result.failed.length} failed`}</span>
          ) : null}
          <span className="block truncate font-mono text-muted" title={result.folder}>
            → {result.folder}
          </span>
          {result.renamedFrom !== null ? (
            <span className="block text-muted" data-testid="card-renamed">
              Folder renamed from “{result.renamedFrom}”.
            </span>
          ) : null}
          {result.problem !== null ? (
            <span className="block text-bad" data-testid="card-problem">
              {result.problem}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
