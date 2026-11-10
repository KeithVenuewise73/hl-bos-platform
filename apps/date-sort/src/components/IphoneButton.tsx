"use client";

import { useEffect, useState } from "react";

import { count } from "@/lib/format.ts";
import {
  durationText,
  previewSentence,
  secondsLeft,
  sizeText,
  type SizeChoice,
} from "@/lib/iphone-progress.ts";
import type { IphoneKind, IphonePageLine } from "@/lib/iphone-script.ts";
import {
  defaultVideoFolder,
  driveNearlyFullMessage,
  folderWarning,
  noRoomMessage,
  roomSentence,
  unknownSizeSentence,
} from "@/lib/iphone-space.ts";

interface Tally {
  device: string;
  total: number;
  /** Left out because the phone dates them older than the chosen days. */
  older: number;
  /** Left out because of the size choice: the other half, for another time. */
  held: number;
  /** Not in the folder yet when it started, and how big that is together. */
  todo: number;
  todoBytes: number;
  /** Bytes copied so far, and when the first file began, for the speed seen. */
  copiedBytes: number;
  startedAt: number;
  done: number;
  copied: number;
  already: number;
  conflicts: number;
  /** Already in the folder but smaller than on the phone: cut short earlier. */
  short: string[];
  failed: string[];
  /** Windows error boxes closed during this copy, with what each said. */
  boxes: string[];
}

type State =
  | { readonly kind: "idle" }
  | {
      readonly kind: "copying";
      /** Another copy from the phone is running; this one starts when it ends. */
      readonly waitingFor?: IphoneKind;
      readonly tally: Tally | null;
      /** While the phone is being listed: the folder, and files found so far. */
      readonly looking?: { readonly folder: string; readonly sofar: number };
    }
  | { readonly kind: "done"; readonly tally: Tally }
  /** "Check size first": what would come across; nothing was copied. */
  | { readonly kind: "checked"; readonly text: string }
  | { readonly kind: "problem"; readonly message: string; readonly detail?: string };

/** The two buttons: photos and videos are kept in separate folders. */
export function IphoneButton({
  disabled,
  onReady,
}: {
  disabled: boolean;
  /** The folder now holds what was brought in: scan it. */
  onReady: (folder: string) => void;
}) {
  return (
    <div className="space-y-4 border-t border-line pt-3" data-testid="iphone">
      <IphoneCopy kind="photos" disabled={disabled} onReady={onReady} />
      <IphoneCopy kind="videos" disabled={disabled} onReady={onReady} />
      <p className="text-xs text-muted">
        Only copies: nothing on the iPhone is moved, changed or deleted. Once you have
        checked everything is in its folder, delete it on the phone yourself. Photos and
        videos use one cable, so if you press both, the second waits for the first and
        starts by itself.
      </p>
    </div>
  );
}

const LABELS = {
  photos: {
    button: "Bring in photos from iPhone",
    busy: "Copying photos from the iPhone…",
    plural: "photos",
    folderKey: "iphoneFolder",
    purpose: "iphone",
  },
  videos: {
    button: "Bring in videos from iPhone",
    busy: "Copying videos from the iPhone…",
    plural: "videos",
    folderKey: "iphoneVideoFolder",
    purpose: "iphone-videos",
  },
} as const;

/** How far back to bring in. The first press should not drag in years of old clips. */
/** Smallest files always come first. These choices split the job in two. */
const SIZES: ReadonlyArray<{ readonly value: SizeChoice; readonly label: string }> = [
  { value: "all", label: "all sizes, smallest first" },
  { value: "small", label: "small files only (under 1 GB): now" },
  { value: "large", label: "large files only (over 1 GB): overnight" },
];

const RANGES: ReadonlyArray<{ readonly days: number | null; readonly label: string }> =
  [
    { days: 30, label: "from the last 30 days" },
    { days: 90, label: "from the last 90 days" },
    { days: 365, label: "from the last year" },
    { days: null, label: "everything on the phone" },
  ];

/**
 * One button: copies the plugged-in iPhone's photos (or videos) into a folder
 * kept for them (chosen once, remembered), skipping what is already there,
 * then scans that folder. The phone is only read.
 */
function IphoneCopy({
  kind,
  disabled,
  onReady,
}: {
  kind: IphoneKind;
  disabled: boolean;
  onReady: (folder: string) => void;
}) {
  const label = LABELS[kind];
  const [days, setDays] = useState<number | null>(30);
  const [size, setSize] = useState<SizeChoice>("all");
  /** Ticks while copying so the time left keeps up with the clock. */
  const [, setNow] = useState(0);
  const [folder, setFolder] = useState<string | null>(null);
  /** The folder was suggested (beside the photos), not chosen or saved yet. */
  const [suggested, setSuggested] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  /** Whether Windows agreed to stay awake for this copy; null until it answers. */
  const [awake, setAwake] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/settings", { headers: { "Content-Type": "application/json" } })
      .then((r) => r.json())
      .then((s: Record<string, string | null | undefined>) => {
        const saved = s[label.folderKey] ?? null;
        if (saved !== null) {
          setFolder(saved);
          return;
        }
        // Videos with no folder yet: beside the photos, never on C: or in OneDrive.
        const beside = kind === "videos" ? defaultVideoFolder(s["iphoneFolder"]) : null;
        if (beside !== null) {
          setFolder(beside);
          setSuggested(true);
        }
      })
      .catch(() => undefined);
  }, [label.folderKey, kind]);

  async function chooseFolder(): Promise<string | null> {
    const res = await fetch("/api/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: label.purpose }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as {
      kind?: string;
      path?: string;
      reason?: string;
    };
    if (out.kind === "picked" && out.path) {
      setFolder(out.path);
      setSuggested(false);
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [label.folderKey]: out.path }),
      }).catch(() => undefined);
      return out.path;
    }
    if (out.kind === "busy") {
      setState({
        kind: "problem",
        message:
          "A folder window is already open, probably behind this page. Look for it on the taskbar (or press Alt+Tab), then choose a folder or press Cancel in it. If you cannot find it, close DateSort and start it again.",
      });
    } else if (out.kind !== "cancelled") {
      setState({
        kind: "problem",
        message: out.reason ?? "The folder window could not be opened.",
      });
    }
    return null;
  }

  useEffect(() => {
    if (state.kind !== "copying" || state.tally === null) return;
    const id = setInterval(() => setNow((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [state.kind, state.kind === "copying" && state.tally !== null]);

  async function bringIn(preview = false) {
    const into = folder ?? (await chooseFolder());
    if (into === null) return;
    if (suggested) {
      // The suggestion becomes the remembered choice the first time it is used.
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [label.folderKey]: into }),
      }).catch(() => undefined);
      setSuggested(false);
    }
    setState({ kind: "copying", tally: null });
    setAwake(null);
    let tally: Tally | null = null;
    let ended = false;
    /** What the drive has, once known: added to the size check's answer. */
    let roomNote = "";
    try {
      const res = await fetch("/api/iphone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: into, kind, days, size, preview }),
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setState({
          kind: "problem",
          message: out.error ?? "The iPhone could not be read.",
        });
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
          const m = JSON.parse(line) as IphonePageLine;
          if (m.type === "awake") {
            setAwake(m.held);
            setState({ kind: "copying", tally: null });
          } else if (m.type === "waiting") {
            setState({ kind: "copying", tally: null, waitingFor: m.for });
          } else if (m.type === "space") {
            if (m.live) {
              // Stopped part-way to keep the drive from filling up.
              ended = true;
              setState({
                kind: "problem",
                message: driveNearlyFullMessage(into, m.needed, m.free ?? 0),
              });
            } else {
              roomNote =
                m.sizeKnown === false
                  ? unknownSizeSentence(into, m.free)
                  : roomSentence(into, m.needed, m.free, m.enough);
              if (!m.enough && !preview) {
                // Nothing is copied: the server stopped it before it began.
                ended = true;
                setState({
                  kind: "problem",
                  message: noRoomMessage(into, m.needed, m.free),
                });
              }
            }
          } else if (m.type === "none") {
            ended = true;
            setState({
              kind: "problem",
              message:
                "No iPhone found. Plug it in with its cable, unlock it, and tap Trust if it asks, then press the button again.",
            });
          } else if (m.type === "locked") {
            ended = true;
            setState({
              kind: "problem",
              message: `${m.device} is connected but its ${label.plural} can't be seen yet. Unlock it and tap Trust (then enter its passcode), then press the button again.`,
              ...(m.seen
                ? { detail: `What Windows sees inside the phone: ${m.seen}` }
                : {}),
            });
          } else if (m.type === "looking") {
            setState({
              kind: "copying",
              tally: null,
              looking: { folder: m.folder, sofar: m.sofar },
            });
          } else if (m.type === "error") {
            ended = true;
            setState({ kind: "problem", message: m.message });
          } else if (m.type === "found") {
            tally = {
              device: m.device,
              total: m.total,
              older: m.older ?? 0,
              held: m.held ?? 0,
              todo: m.todo ?? m.total,
              todoBytes: m.todoBytes ?? m.bytes,
              copiedBytes: 0,
              startedAt: Date.now(),
              done: 0,
              copied: 0,
              already: 0,
              conflicts: 0,
              short: [],
              failed: [],
              boxes: [],
            };
            setState({ kind: "copying", tally: { ...tally } });
          } else if (m.type === "dialog" && tally !== null) {
            tally.boxes.push(`${m.folder}\\${m.name}: ${m.text}`);
            setState({
              kind: "copying",
              tally: {
                ...tally,
                short: [...tally.short],
                failed: [...tally.failed],
                boxes: [...tally.boxes],
              },
            });
          } else if (m.type === "previewed" && tally !== null) {
            ended = true;
            setState({
              kind: "checked",
              text: `${previewSentence(label.plural, size, {
                total: tally.total,
                todo: tally.todo,
                todoBytes: tally.todoBytes,
                older: tally.older,
                held: tally.held,
              })}${roomNote === "" ? "" : ` ${roomNote}`}`,
            });
          } else if (m.type === "file" && tally !== null) {
            tally.done += 1;
            if (m.result === "copied") {
              tally.copied += 1;
              tally.copiedBytes += m.bytes ?? 0;
            } else if (m.result === "already") tally.already += 1;
            else if (m.result === "conflict") tally.conflicts += 1;
            else if (m.result === "short") tally.short.push(`${m.folder}\\${m.name}`);
            else tally.failed.push(`${m.folder}\\${m.name}`);
            setState({
              kind: "copying",
              tally: {
                ...tally,
                short: [...tally.short],
                failed: [...tally.failed],
                boxes: [...tally.boxes],
              },
            });
          } else if (m.type === "stuck") {
            ended = true;
            setState({
              kind: "problem",
              message: `The iPhone stopped answering after ${tally !== null ? `${tally.copied.toLocaleString("en-US")} files were copied and ` : ""}several files in a row could not be read. Unplug it, plug it back in and unlock it, then press the button again. What is copied is kept; the files that failed are tried last next time.`,
            });
          } else if (m.type === "done" && tally !== null) {
            ended = true;
            setState({ kind: "done", tally });
            onReady(into);
          }
        }
      }
      if (!ended) {
        setState({
          kind: "problem",
          message:
            "Copying from the iPhone stopped part-way (was it unplugged or locked?). Everything copied so far is complete; press the button again to finish the rest.",
        });
      }
    } catch {
      setState({
        kind: "problem",
        message:
          "DateSort lost touch with this page. Press the button again; what is already copied is skipped.",
      });
    }
  }

  const busy = state.kind === "copying";
  const t = state.kind === "copying" || state.kind === "done" ? state.tally : null;
  const id = (name: string) => `iphone-${kind}-${name}`;
  return (
    <div className="space-y-2" data-testid={id("panel")}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          data-testid={id("button")}
          disabled={disabled || busy}
          onClick={() => void bringIn()}
        >
          {busy ? label.busy : label.button}
        </button>
        <button
          type="button"
          className="underline text-sm"
          data-testid={id("check")}
          disabled={disabled || busy}
          onClick={() => void bringIn(true)}
        >
          Check size first
        </button>
        <select
          className="rounded border border-line bg-transparent px-2 py-1 text-sm"
          data-testid={id("size")}
          aria-label={`Which ${label.plural} to bring in by size`}
          disabled={busy}
          value={size}
          onChange={(e) => setSize(e.target.value as SizeChoice)}
        >
          {SIZES.map((z) => (
            <option key={z.value} value={z.value}>
              {z.label}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-line bg-transparent px-2 py-1 text-sm"
          data-testid={id("range")}
          aria-label={`How far back to bring in ${label.plural}`}
          disabled={busy}
          value={days === null ? "all" : String(days)}
          onChange={(e) =>
            setDays(e.target.value === "all" ? null : Number(e.target.value))
          }
        >
          {RANGES.map((r) => (
            <option key={r.label} value={r.days === null ? "all" : String(r.days)}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted" data-testid={id("folder")}>
          {folder === null ? (
            `Plug in and unlock the iPhone first. You'll choose where its ${label.plural} are kept.`
          ) : (
            <>
              {suggested ? "Will be kept in" : "Kept in"}{" "}
              <span className="font-mono">{folder}</span> ·{" "}
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void chooseFolder()}
              >
                change
              </button>
            </>
          )}
        </span>
      </div>
      {folder !== null && folderWarning(folder, label.plural) !== null ? (
        <p className="text-sm text-amber-500" data-testid={id("folder-warning")}>
          {folderWarning(folder, label.plural)}
        </p>
      ) : null}
      {state.kind === "checked" ? (
        <p className="text-sm" data-testid={id("checked")}>
          {state.text}
        </p>
      ) : null}
      {busy && state.waitingFor ? (
        <p className="text-sm" data-testid={id("waiting")}>
          The iPhone&apos;s {state.waitingFor} are being brought in right now. This
          starts by itself when that finishes.
        </p>
      ) : null}
      {busy && t === null && !state.waitingFor ? (
        <p className="text-sm" data-testid={id("looking")}>
          {state.looking
            ? `Reading the iPhone's ${state.looking.folder} folder… ${count(state.looking.sofar, "file")} found so far. A full phone takes a few minutes.`
            : "Looking for the iPhone…"}
        </p>
      ) : null}
      {t !== null ? (
        <p className="text-sm" data-testid={id("progress")}>
          {state.kind === "done" ? "Done: " : `Copying from ${t.device}: `}
          {t.done.toLocaleString("en-US")} of {count(t.total, "file")} ·{" "}
          {t.copied.toLocaleString("en-US")} copied ·{" "}
          {t.already.toLocaleString("en-US")} already there
          {t.older > 0
            ? ` · ${count(t.older, "older file")} left on the phone (change "from the last…" to bring them)`
            : ""}
          {t.conflicts > 0
            ? ` · ${t.conflicts} with the same name as a different file (left alone)`
            : ""}
          {t.failed.length > 0
            ? ` · ${t.failed.length} could not be copied this time (${t.failed.slice(0, 3).join(", ")}${t.failed.length > 3 ? "…" : ""}); press the button again to retry them`
            : ""}
          {t.short.length > 0
            ? ` · ${t.short.length} already in the folder but smaller than on the phone, probably cut short by an earlier copy (${t.short.slice(0, 3).join(", ")}${t.short.length > 3 ? "…" : ""})`
            : ""}
          {state.kind === "done" ? ". Scanning them now." : ""}
        </p>
      ) : null}
      {t !== null && state.kind === "copying" ? (
        <p className="text-sm" data-testid={id("left")}>
          {sizeText(t.copiedBytes)} of {sizeText(t.todoBytes)} brought in
          {(() => {
            const left = secondsLeft(
              t.todoBytes,
              t.copiedBytes,
              (Date.now() - t.startedAt) / 1000,
            );
            return left === null
              ? ". The time left appears once a little has been copied."
              : `, ${durationText(left)} left at the speed so far.`;
          })()}
          {t.held > 0
            ? ` ${count(t.held, "other-size file")} left for another time.`
            : ""}
        </p>
      ) : null}
      {t !== null && t.boxes.length > 0 ? (
        <p className="text-sm" data-testid={id("boxes")}>
          Windows showed {count(t.boxes.length, "error box", "error boxes")}; DateSort
          closed {t.boxes.length === 1 ? "it" : "them"} and skipped{" "}
          {t.boxes.length === 1 ? "that file" : "those files"} (tried again last next
          time): {t.boxes.slice(0, 3).join(" · ")}
          {t.boxes.length > 3 ? "…" : ""}
        </p>
      ) : null}
      {busy && awake !== null ? (
        <p className="text-xs text-muted" data-testid={id("awake")}>
          {awake
            ? "This laptop will not go to sleep until the copy from the iPhone finishes, and the screen stays on until then. Keep the lid open: closing it still puts Windows to sleep."
            : "Windows could not be kept awake for this copy. Keep the laptop awake and the lid open until it finishes; if it does sleep, press the button again to finish the rest."}
        </p>
      ) : null}
      {state.kind === "problem" ? (
        <p className="text-sm text-estimate" data-testid={id("problem")}>
          {state.message}
        </p>
      ) : null}
      {state.kind === "problem" && state.detail ? (
        <p className="font-mono text-xs text-muted" data-testid={id("detail")}>
          {state.detail}
        </p>
      ) : null}
    </div>
  );
}
