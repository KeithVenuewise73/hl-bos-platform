"use client";

import { useEffect, useRef, useState } from "react";

import { folderName } from "@hl-bos/date-sort";

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
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/settings", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((s: { destination?: string | null }) => {
        if (s.destination) setDestination(s.destination);
      })
      .catch(() => undefined);
  }, []);

  async function rememberDestination(path: string) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: path }),
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
        "Choose where the date folders should go first (Browse… under Copy to dated folders).",
      );
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(days);
    setError(null);
    setProgress(null);
    await rememberDestination(destination.trim());
    try {
      const res = await fetch("/api/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: view.scanId,
          destination: destination.trim(),
          days: days.map((day) => ({ day, eventName: names[day] ?? "" })),
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
          if (m.type === "progress") setProgress(m);
          else if (m.type === "done")
            setResults((prev) => {
              const next = { ...prev };
              for (const d of m.days) next[d.day] = d;
              return next;
            });
          else setError(m.message);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) {
        setError(
          "Stopped. Everything copied so far is complete and checked; press the button again to finish the rest.",
        );
      } else {
        setError(
          `The copy stopped: ${e instanceof Error ? e.message : String(e)}. Your originals were not touched.`,
        );
      }
    } finally {
      setRunning(null);
      setProgress(null);
    }
  }

  return {
    destination,
    setDestination,
    names,
    setName: (day: string, name: string) => setNames((n) => ({ ...n, [day]: name })),
    browse,
    browsing,
    note,
    run,
    running,
    progress,
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
          placeholder="D:\5-Star Sports Media\Games"
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
              if (
                window.confirm(
                  `Copy ${count(photos, "photo")} into ${count(days.length, "dated folder")} in\n${copy.destination || "(no destination chosen)"}?\n\nYour originals are not moved or changed.`,
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
            Copying {longDate(copy.progress.day)}…{" "}
            {copy.progress.done.toLocaleString("en-US")} of{" "}
            {count(copy.progress.total, "photo")} · {gb(copy.progress.bytesCopied)}{" "}
            copied
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
        </p>
      ) : null}
    </div>
  );
}
