"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  ALL_CHOICES,
  checkSentence,
  defaultBaseFolder,
  dayContents,
  dayLabel,
  doneLines,
  FIRST_TIME_DAYS,
  importSteps,
  isClean,
  liveLine,
  lookBackDays,
  lookBackSentence,
  NO_DATE,
  phoneFolders,
  pickedSentence,
  sortDays,
  type ImportChoices,
  type DayRow,
  type ImportStep,
  type StepResult,
} from "@/lib/iphone-import.ts";
import { listDates, runStep, type StepProgress } from "@/lib/iphone-import-run.ts";
import { secondsLeft } from "@/lib/iphone-progress.ts";
import { folderWarning } from "@/lib/iphone-space.ts";

interface Settings {
  iphoneFolder?: string | null;
  iphoneBase?: string | null;
  iphonePhones?: string[];
  iphoneLast?: Record<string, string>;
  iphoneWorkOnly?: string[];
}

type State =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running";
      readonly step: ImportStep;
      readonly index: number;
      readonly total: number;
      readonly startedAt: number;
      readonly progress: StepProgress | null;
      readonly preview: boolean;
    }
  | { readonly kind: "counting" }
  | { readonly kind: "checked"; readonly text: string }
  | {
      readonly kind: "done";
      readonly lines: readonly string[];
      readonly clean: boolean;
    }
  | {
      readonly kind: "problem";
      readonly message: string;
      readonly lines: readonly string[];
    };

const ADD = "__add__";

async function save(body: Record<string, unknown>): Promise<void> {
  await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/**
 * The one-button phone import. Pick which phone this is, press the button: short clips, photos and
 * game footage are copied into a folder for that phone, only what is new since last time, then the
 * short clips are scanned ready to send to 5Star. The phone is only read.
 */
export function IphoneImport({
  disabled,
  onReady,
  workOnlyExtra,
}: {
  disabled: boolean;
  onReady: (folder: string) => void;
  /** Shown only for a phone used for nothing but 5 Star (the older all-days buttons). */
  workOnlyExtra?: ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [base, setBase] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [phones, setPhones] = useState<string[]>([]);
  const [last, setLast] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState<string>("");
  const [workOnly, setWorkOnly] = useState<string[]>([]);
  // A shared phone: the days it has, and which of them were ticked.
  const [dayRows, setDayRows] = useState<readonly DayRow[] | null>(null);
  const [olderMonths, setOlderMonths] = useState(0);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [choices, setChoices] = useState<ImportChoices>(ALL_CHOICES);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, setTick] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Settings) => {
        const names = s.iphonePhones ?? [];
        const lastMap = s.iphoneLast ?? {};
        setPhones(names);
        setLast(lastMap);
        setWorkOnly(s.iphoneWorkOnly ?? []);
        const recent = [...names].sort(
          (a, b) => Date.parse(lastMap[b] ?? "0") - Date.parse(lastMap[a] ?? "0"),
        )[0];
        setPhone(recent ?? "");
        setAdding(names.length === 0);
        if (typeof s.iphoneBase === "string") setBase(s.iphoneBase);
        else {
          const beside = defaultBaseFolder(s.iphoneFolder, (f) =>
            folderWarning(f, "videos"),
          );
          if (beside !== null) {
            setBase(beside);
            setSuggested(true);
          }
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (state.kind !== "running") return;
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [state.kind]);

  async function chooseBase(): Promise<string | null> {
    const res = await fetch("/api/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "iphone-base" }),
    }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as {
      kind?: string;
      path?: string;
      reason?: string;
    };
    if (out.kind === "picked" && out.path) {
      setBase(out.path);
      setSuggested(false);
      await save({ iphoneBase: out.path });
      return out.path;
    }
    if (out.kind === "busy")
      setState({
        kind: "problem",
        message:
          "A folder window is already open, probably behind this page. Look for it on the taskbar (or press Alt+Tab), then choose a folder or press Cancel in it.",
        lines: [],
      });
    else if (out.kind !== "cancelled")
      setState({
        kind: "problem",
        message: out.reason ?? "The folder window could not be opened.",
        lines: [],
      });
    return null;
  }

  async function addPhone() {
    const name = newName.replace(/\s+/g, " ").trim();
    if (name === "" || !/^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,39}$/.test(name)) {
      setState({
        kind: "problem",
        message:
          "Give the phone a short name using letters and numbers, for example Game phone 13 Pro.",
        lines: [],
      });
      return;
    }
    const next = phones.some((p) => p.toLowerCase() === name.toLowerCase())
      ? phones
      : [...phones, name];
    setPhones(next);
    setPhone(next.find((p) => p.toLowerCase() === name.toLowerCase()) ?? name);
    setAdding(false);
    setNewName("");
    setState({ kind: "idle" });
    await save({ iphonePhones: next });
  }

  async function markWorkOnly(on: boolean) {
    const next = on
      ? [...workOnly.filter((p) => p !== phone), phone]
      : workOnly.filter((p) => p !== phone);
    setWorkOnly(next);
    setDayRows(null);
    setTicked(new Set());
    setState({ kind: "idle" });
    await save({ iphoneWorkOnly: next });
  }

  /** A shared phone: count what it has, day by day. Nothing is copied. */
  async function showDays() {
    if (running.current) return;
    if (phone === "") {
      setState({
        kind: "problem",
        message:
          "Tell DateSort which phone this is first (for example Game phone 13 Pro).",
        lines: [],
      });
      return;
    }
    const into = base ?? (await chooseBase());
    if (into === null) return;
    running.current = true;
    setState({ kind: "counting" });
    try {
      const out = await listDates(into, FIRST_TIME_DAYS);
      if (out.kind === "problem") {
        setState({ kind: "problem", message: out.message, lines: [] });
        return;
      }
      setDayRows(sortDays(out.rows));
      setOlderMonths(out.olderFolders);
      setTicked(new Set());
      setState({ kind: "idle" });
    } finally {
      running.current = false;
    }
  }

  async function bringIn(preview: boolean) {
    if (running.current) return;
    if (phone === "") {
      setState({
        kind: "problem",
        message:
          "Tell DateSort which phone this is first (for example Game phone 13 Pro).",
        lines: [],
      });
      return;
    }
    const into = base ?? (await chooseBase());
    if (into === null) return;
    if (suggested) {
      await save({ iphoneBase: into });
      setSuggested(false);
    }
    const shared = !workOnly.includes(phone);
    const pick = shared ? [...ticked] : null;
    if (shared && (pick?.length ?? 0) === 0) {
      setState({
        kind: "problem",
        message:
          "This phone is shared, so tick the days to bring in first. Nothing comes across from a day you leave unticked.",
        lines: [],
      });
      return;
    }
    const steps = importSteps(into, phone, choices);
    if (steps.length === 0) {
      setState({
        kind: "problem",
        message: "Tick at least one of short clips, photos or game footage.",
        lines: [],
      });
      return;
    }
    running.current = true;
    const startedAt = new Date();
    // A shared phone is always asked about the same month, so a day left unticked is not lost.
    const days = shared ? FIRST_TIME_DAYS : lookBackDays(last[phone], startedAt);
    const results: StepResult[] = [];
    try {
      for (const [index, step] of steps.entries()) {
        setState({
          kind: "running",
          step,
          index,
          total: steps.length,
          startedAt: Date.now(),
          progress: null,
          preview,
        });
        const began = Date.now();
        const out = await runStep(
          step,
          days,
          preview,
          (progress) =>
            setState({
              kind: "running",
              step,
              index,
              total: steps.length,
              startedAt: began,
              progress,
              preview,
            }),
          fetch,
          pick,
        );
        results.push(out.result);
        if (out.kind === "problem") {
          setState({
            kind: "problem",
            message: out.message,
            lines: preview ? [] : doneLines(results.slice(0, -1)),
          });
          return;
        }
      }
      if (preview) {
        setState({
          kind: "checked",
          text: `${shared ? `Only the ${pick?.length ?? 0} ticked ${pick?.length === 1 ? "day" : "days"}.` : lookBackSentence(last[phone], days)} ${checkSentence(results)}`,
        });
        return;
      }
      const clean = isClean(results);
      setState({ kind: "done", lines: doneLines(results), clean });
      if (clean && !shared) {
        const at = startedAt.toISOString();
        setLast((l) => ({ ...l, [phone]: at }));
        await save({ iphoneLastImport: { phone, at } });
      }
      const folders = phoneFolders(into, phone);
      const toScan = choices.clips
        ? folders.clips
        : choices.photos
          ? folders.photos
          : null;
      if (toScan !== null) onReady(toScan);
    } finally {
      running.current = false;
    }
  }

  const busy = state.kind === "running" || state.kind === "counting";
  const isWorkOnly = phone !== "" && workOnly.includes(phone);
  const needDays = !isWorkOnly && dayRows === null;
  const warn = base !== null ? folderWarning(base, "videos") : null;
  const tick = (key: keyof ImportChoices, v: boolean) =>
    setChoices((c) => ({ ...c, [key]: v }));
  return (
    <div className="space-y-3" data-testid="phone-import">
      <h3 className="text-sm font-semibold">Bring in everything new from a phone</h3>
      <div className="flex flex-wrap items-center gap-3">
        {adding ? (
          <>
            <input
              className="rounded border border-line bg-transparent px-2 py-1 text-sm"
              data-testid="phone-name"
              placeholder="Name this phone, e.g. Game phone 13 Pro"
              value={newName}
              maxLength={40}
              aria-label="Name for this phone"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addPhone();
              }}
            />
            <button
              type="button"
              className="btn-ghost"
              data-testid="phone-save"
              onClick={() => void addPhone()}
            >
              Save name
            </button>
            {phones.length > 0 ? (
              <button
                type="button"
                className="underline text-sm"
                onClick={() => setAdding(false)}
              >
                cancel
              </button>
            ) : null}
          </>
        ) : (
          <label className="text-sm">
            Which phone is plugged in?{" "}
            <select
              className="rounded border border-line bg-transparent px-2 py-1 text-sm"
              data-testid="phone-select"
              disabled={busy}
              value={phone}
              onChange={(e) => {
                if (e.target.value === ADD) setAdding(true);
                else {
                  setPhone(e.target.value);
                  setDayRows(null);
                  setTicked(new Set());
                  setState({ kind: "idle" });
                }
              }}
            >
              {phones.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value={ADD}>Add another phone…</option>
            </select>
          </label>
        )}
      </div>
      {phone !== "" && !adding ? (
        <div className="space-y-1 text-sm" data-testid="phone-sharing">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="phone-work-only"
              checked={isWorkOnly}
              disabled={busy}
              onChange={(e) => void markWorkOnly(e.target.checked)}
            />
            This phone is used only for 5 Star
          </label>
          {isWorkOnly ? null : (
            <p className="text-xs text-muted" data-testid="phone-shared-note">
              Shared phone: you pick the days to bring in, so personal photos and videos
              stay on the phone and never reach the drive.
            </p>
          )}
        </div>
      ) : null}
      <div
        className="flex flex-wrap items-center gap-4 text-sm"
        data-testid="phone-choices"
      >
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="choice-clips"
            checked={choices.clips}
            disabled={busy}
            onChange={(e) => tick("clips", e.target.checked)}
          />
          Short clips (under 1 GB)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="choice-photos"
            checked={choices.photos}
            disabled={busy}
            onChange={(e) => tick("photos", e.target.checked)}
          />
          Photos
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="choice-games"
            checked={choices.games}
            disabled={busy}
            onChange={(e) => tick("games", e.target.checked)}
          />
          Game footage (over 1 GB)
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          data-testid="phone-import-button"
          disabled={disabled || busy || !loaded}
          onClick={() => void (needDays ? showDays() : bringIn(false))}
        >
          {state.kind === "counting"
            ? "Counting what is on the phone…"
            : busy
              ? "Bringing in from the phone…"
              : needDays
                ? "Show the days on this phone"
                : isWorkOnly
                  ? "Bring in everything new from this phone"
                  : "Bring in the ticked days"}
        </button>
        {needDays ? null : (
          <button
            type="button"
            className="underline text-sm"
            data-testid="phone-import-check"
            disabled={disabled || busy || !loaded}
            onClick={() => void bringIn(true)}
          >
            Check first
          </button>
        )}
        <span className="text-xs text-muted" data-testid="phone-base">
          {base === null ? (
            "You'll choose where to keep everything the first time."
          ) : (
            <>
              {suggested ? "Will be kept in" : "Kept in"}{" "}
              <span className="font-mono">
                {base}
                {"\\"}
                {phone === "" ? "<phone>" : phone}
              </span>{" "}
              ·{" "}
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void chooseBase()}
              >
                change
              </button>
            </>
          )}
        </span>
      </div>
      {!isWorkOnly && dayRows !== null ? (
        <div className="space-y-2" data-testid="phone-days">
          <p className="text-sm">
            {dayRows.length === 0
              ? "Nothing from the last 30 days was found on this phone."
              : "Tick only the days you shot for 5 Star. Days you leave unticked are not copied."}
          </p>
          {dayRows.map((r) =>
            r.d === NO_DATE ? (
              <p key={r.d} className="text-xs text-muted" data-testid="day-none">
                {dayContents(r)} have no date from the phone, so they are never brought
                in.
              </p>
            ) : (
              <label key={r.d} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`day-${r.d}`}
                  checked={ticked.has(r.d)}
                  disabled={busy}
                  onChange={(e) =>
                    setTicked((t) => {
                      const next = new Set(t);
                      if (e.target.checked) next.add(r.d);
                      else next.delete(r.d);
                      return next;
                    })
                  }
                />
                <span>
                  <span className="font-medium">{dayLabel(r.d)}</span>
                  <span className="text-muted"> · {dayContents(r)}</span>
                </span>
              </label>
            ),
          )}
          {olderMonths > 0 ? (
            <p className="text-xs text-muted">
              Older months on the phone are not shown. Only the last 30 days are.
            </p>
          ) : null}
          <p className="text-xs text-muted" data-testid="phone-picked">
            {pickedSentence(ticked.size)}{" "}
            <button
              type="button"
              className="underline"
              disabled={busy}
              onClick={() => void showDays()}
            >
              Count again
            </button>
          </p>
        </div>
      ) : null}
      {isWorkOnly ? workOnlyExtra : null}
      {warn !== null ? (
        <p className="text-sm text-amber-500" data-testid="phone-base-warning">
          {warn}
        </p>
      ) : null}
      {state.kind === "running" ? (
        <div className="space-y-1" data-testid="phone-progress">
          <p className="text-sm" data-testid="phone-live">
            {state.progress?.waiting
              ? "Another copy from the phone is running first. This starts by itself when it finishes."
              : state.progress === null || state.progress.looking
                ? `Step ${state.index + 1} of ${state.total}: reading the phone for ${state.step.title}… a full phone takes a few minutes.`
                : liveLine(
                    state.step,
                    state.index,
                    state.total,
                    state.progress.done,
                    state.progress.todo,
                    secondsLeft(
                      state.progress.todoBytes,
                      state.progress.copiedBytes,
                      (Date.now() - state.startedAt) / 1000,
                    ),
                  )}
          </p>
          <p className="text-xs text-muted">
            Keep the phone unlocked and plugged in, and the laptop awake with the lid
            open.
          </p>
        </div>
      ) : null}
      {state.kind === "checked" ? (
        <p className="text-sm" data-testid="phone-checked">
          {state.text}
        </p>
      ) : null}
      {state.kind === "done" ? (
        <div className="space-y-1 text-sm" data-testid="phone-done">
          {state.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="text-muted">
            {state.clean
              ? "All done. The short clips are scanned below, ready to send for review. Nothing on the phone was changed: delete from the phone yourself once you have checked the files are on the drive."
              : "Some files are left to retry (see above). Press the button again: what is already copied is skipped."}
          </p>
        </div>
      ) : null}
      {state.kind === "problem" ? (
        <div className="space-y-1 text-sm text-estimate" data-testid="phone-problem">
          {state.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>{state.message}</p>
        </div>
      ) : null}
    </div>
  );
}
