"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clock,
  durationWords,
  estimateBytes,
  secondsLeft,
  sizeText,
} from "@/lib/format.ts";
import type { JobSnapshot, PlanSummary, ToolStatus } from "@/lib/types.ts";

type Tab = "broadcast" | "times";
type Quality = "full" | "draft";

interface Reply {
  readonly ok: boolean;
  readonly status: number;
  readonly json: Record<string, unknown>;
}

async function api(path: string, body?: unknown): Promise<Reply> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      ok: res.ok,
      status: res.status,
      json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      json: { error: "Game Cut could not be reached. Is its window still open?" },
    };
  }
}

const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** A file chooser: a button, and the chosen path. */
function FileChoice({
  label,
  purpose,
  value,
  onChange,
  onProblem,
  optional,
  testid,
}: {
  label: string;
  purpose: "video-a" | "video-b" | "video";
  value: string;
  onChange: (path: string) => void;
  onProblem: (message: string) => void;
  optional?: boolean;
  testid: string;
}) {
  async function choose() {
    const r = await api("/api/pick", {
      purpose,
      startFolder: value.replace(/[\\/][^\\/]*$/, ""),
    });
    const kind = text(r.json["kind"]);
    if (kind === "picked") onChange(text(r.json["path"]));
    else if (kind === "busy")
      onProblem(
        "A file window is already open, probably behind this page. Look for it on the taskbar (or press Alt+Tab), then choose a file or press Cancel in it. If you cannot find it, close Game Cut and start it again.",
      );
    else if (kind === "failed")
      onProblem(text(r.json["reason"]) || "The file window could not be opened.");
    else if (!r.ok)
      onProblem(text(r.json["error"]) || "The file window could not be opened.");
  }
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold">
        {label}{" "}
        {optional ? <span className="font-normal text-muted">(optional)</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void choose()}
          data-testid={`${testid}-choose`}
        >
          {value === "" ? "Choose the video…" : "Change…"}
        </button>
        {value !== "" ? (
          <>
            <span
              className="break-all font-mono text-xs"
              data-testid={`${testid}-path`}
            >
              {value}
            </span>
            {optional ? (
              <button
                type="button"
                className="text-xs underline text-muted"
                onClick={() => onChange("")}
              >
                leave out
              </button>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-muted">
            Nothing chosen yet. It is read where it is; nothing is uploaded.
          </span>
        )}
      </div>
      <input
        type="text"
        className="block w-full rounded border border-line bg-transparent px-2 py-1 font-mono text-xs"
        placeholder="or paste the full path here, like D:\Hockey Videos\IMG_0056.MOV"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        aria-label={`${label}: path`}
        data-testid={`${testid}-text`}
      />
    </div>
  );
}

export function GameCutApp() {
  const [tab, setTab] = useState<Tab>("broadcast");
  const [tools, setTools] = useState<ToolStatus | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const [bFileA, setBFileA] = useState("");
  const [bFileB, setBFileB] = useState("");
  const [quiet, setQuiet] = useState("90");
  const [tFileA, setTFileA] = useState("");
  const [tFileB, setTFileB] = useState("");
  const [timesText, setTimesText] = useState("");
  const [before, setBefore] = useState(8);
  const [after, setAfter] = useState(6);
  const [quality, setQuality] = useState<Quality>("draft");
  const [outPath, setOutPath] = useState("");
  const [incText, setIncText] = useState("");
  const [incClock, setIncClock] = useState<"first" | "second" | "finished">("first");
  const [incBefore, setIncBefore] = useState(8);
  const [incAfter, setIncAfter] = useState(6);
  /** The plan the last finished video was made from (a time on that video can be turned back into game time). */
  const [watchedPlanId, setWatchedPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [showAll, setShowAll] = useState(false);
  const lastPlanJob = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const r = await api("/api/jobs/current");
    setJob((r.json["job"] as JobSnapshot | null | undefined) ?? null);
  }, []);

  useEffect(() => {
    void api("/api/status").then((r) => {
      setTools((r.json["tools"] as ToolStatus | undefined) ?? null);
      setJob((r.json["job"] as JobSnapshot | null | undefined) ?? null);
    });
    // Planning a long game takes the better part of an hour: get the latest plan back after a
    // reload, or after Game Cut was closed and started again, instead of losing it.
    void api("/api/plans/latest").then((r) => {
      const saved = r.json["plan"] as PlanSummary | null | undefined;
      if (saved) {
        setPlan((now) => now ?? saved);
        setTab((t) => (t === "broadcast" || t === "times" ? saved.mode : t));
      }
    });
  }, []);

  // While a job runs, ask how it is going. The job lives on the server: this page can be
  // closed, reloaded or put to sleep without stopping it.
  const running = job?.state === "running";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [running, refresh]);

  useEffect(() => {
    if (job?.state === "done" && job.result?.kind === "make")
      setWatchedPlanId(job.result.made.planId);
  }, [job]);

  // A finished planning job becomes the plan on screen (also after the page was reopened).
  useEffect(() => {
    if (
      job?.state === "done" &&
      job.result?.kind === "plan" &&
      lastPlanJob.current !== job.id
    ) {
      lastPlanJob.current = job.id;
      setPlan(job.result.plan);
      setShowAll(false);
      setTab(job.result.plan.mode);
    }
  }, [job]);

  async function lookAgain() {
    const r = await api("/api/status?again=1");
    setTools((r.json["tools"] as ToolStatus | undefined) ?? null);
  }

  async function startPlan(body: Record<string, unknown>) {
    setProblem(null);
    setWarning(null);
    setPlan(null);
    const r = await api("/api/jobs/plan", body);
    if (!r.ok) {
      setProblem(text(r.json["error"]) || "That could not be started.");
      return;
    }
    setNow(Date.now());
    await refresh();
  }

  async function startMake() {
    if (plan === null) return;
    setProblem(null);
    setWarning(null);
    const first = plan.names.a.replace(/\.[^.]*$/, "");
    const suggestion =
      plan.mode === "broadcast"
        ? `${first} - broadcast.mp4`
        : `${first} - highlights.mp4`;
    let target = outPath.trim();
    if (target === "") {
      const picked = await api("/api/pick", {
        purpose: "save",
        suggestedName: suggestion,
      });
      const kind = text(picked.json["kind"]);
      if (kind === "cancelled") return;
      if (kind !== "picked") {
        setProblem(
          kind === "busy"
            ? "A file window is already open. Look for it on the taskbar."
            : (text(picked.json["reason"]) || "The save window could not be opened.") +
                " You can type where to save it in the box above the button instead.",
        );
        return;
      }
      target = text(picked.json["path"]);
    }
    const r = await api("/api/jobs/make", {
      planId: plan.planId,
      outFile: target,
      quality,
    });
    if (!r.ok) {
      setProblem(text(r.json["error"]) || "That could not be started.");
      return;
    }
    setWarning(typeof r.json["warning"] === "string" ? r.json["warning"] : null);
    setNow(Date.now());
    await refresh();
  }

  async function addMoments() {
    if (plan === null) return;
    setProblem(null);
    setWarning(null);
    const r = await api("/api/jobs/adjust", {
      planId: plan.planId,
      watchedPlanId,
      timesText: incText,
      clock: incClock,
      beforeSeconds: incBefore,
      afterSeconds: incAfter,
    });
    if (!r.ok) {
      setProblem(text(r.json["error"]) || "That could not be started.");
      return;
    }
    setNow(Date.now());
    await refresh();
  }

  async function stop() {
    await api("/api/jobs/cancel", {});
    await refresh();
  }

  const ffmpegMissing = tools !== null && !tools.found;
  const busy = running;
  const elapsed = job === null ? 0 : ((job.endedAt ?? now) - job.startedAt) / 1000;
  const left =
    job !== null && job.state === "running" && job.kind === "make"
      ? secondsLeft(job.fraction, elapsed)
      : null;
  const showNames =
    plan !== null && (plan.mode === "times" || plan.rows.some((r) => r.label !== ""));
  const made =
    job?.state === "done" && job.result?.kind === "make" ? job.result.made : null;
  const rows = plan === null ? [] : showAll ? plan.rows : plan.rows.slice(0, 15);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-wide">Game Cut</h1>
        <p className="text-sm text-muted">
          Two cameras, one game. Choose the videos on this computer (nothing is
          uploaded), see exactly what it picks, then make the video.
        </p>
      </header>

      {ffmpegMissing ? (
        <div className="card border-bad" role="alert" data-testid="ffmpeg-missing">
          <p className="text-sm">{tools?.message}</p>
          <button
            type="button"
            className="btn-ghost mt-3"
            onClick={() => void lookAgain()}
          >
            Look again
          </button>
        </div>
      ) : tools !== null && tools.found && tools.hdrConversion === false ? (
        <p className="text-sm text-estimate" data-testid="hdr-warning">
          {tools.message}
        </p>
      ) : null}

      {problem !== null ? (
        <p
          className="card border-bad text-sm text-bad"
          role="alert"
          data-testid="problem"
        >
          {problem}
        </p>
      ) : null}

      {job !== null ? (
        <section className="card space-y-3" data-testid="job" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">
              {job.label}
              {job.state === "running"
                ? ""
                : job.state === "done"
                  ? " · finished"
                  : job.state === "cancelled"
                    ? " · stopped"
                    : " · stopped by a problem"}
            </div>
            {job.state === "running" ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void stop()}
                data-testid="stop"
              >
                Stop
              </button>
            ) : null}
          </div>
          <div className="h-3 w-full overflow-hidden rounded bg-panel-2">
            <div
              className={`h-full ${job.state === "failed" ? "bg-bad" : "bg-brand"}`}
              style={{ width: `${Math.round(job.fraction * 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(job.fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-sm" data-testid="job-step">
            {job.step} · {Math.round(job.fraction * 100)}% · {clock(elapsed)} so far
            {left !== null ? ` · ${durationWords(left)} left` : ""}
          </p>
          {job.state === "running" ? (
            <p className="text-xs text-muted">
              This keeps going if you close this page, and the laptop stays awake while
              it works. Keep the lid open: closing it puts Windows to sleep.
              {job.awake === false
                ? " Windows would not agree to stay awake this time, so do not leave it alone for long."
                : ""}
            </p>
          ) : null}
          {job.state === "failed" ? (
            <p className="text-sm text-bad" data-testid="job-error">
              {job.error}
            </p>
          ) : null}
          {warning !== null ? <p className="text-sm text-estimate">{warning}</p> : null}
          {made !== null ? (
            <div className="space-y-2" data-testid="made">
              <p className="text-sm">
                Done. {clock(made.seconds)} of video, {sizeText(made.bytes)}, saved as{" "}
                <span className="break-all font-mono text-xs">{made.outFile}</span>
              </p>
              <p className="text-xs text-muted" data-testid="picks-file">
                {made.picksFile !== null ? (
                  <>
                    A list of exactly what it picked, with times, was saved beside it as{" "}
                    <span className="break-all font-mono">{made.picksFile}</span>.
                  </>
                ) : (
                  "The list of what it picked could not be saved beside the video."
                )}
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void api("/api/reveal", {})}
              >
                Show it in its folder
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <nav className="flex gap-2" aria-label="What to make">
        <button
          type="button"
          className={tab === "broadcast" ? "btn-primary" : "btn-ghost"}
          onClick={() => setTab("broadcast")}
          data-testid="tab-broadcast"
        >
          Whole game, one broadcast
        </button>
        <button
          type="button"
          className={tab === "times" ? "btn-primary" : "btn-ghost"}
          onClick={() => setTab("times")}
          data-testid="tab-times"
        >
          Highlights from times
        </button>
      </nav>

      {tab === "broadcast" ? (
        <section className="card space-y-4" data-testid="panel-broadcast">
          <p className="text-sm text-muted">
            Lines the two videos up by the sound they share, then follows the play from
            one end of the ice to the other, showing whichever camera is nearer the
            action. The result is about one game long, not two.
          </p>
          <FileChoice
            label="First video"
            purpose="video-a"
            value={bFileA}
            onChange={setBFileA}
            onProblem={setProblem}
            testid="b-a"
          />
          <FileChoice
            label="Second video (the other end of the ice)"
            purpose="video-b"
            value={bFileB}
            onChange={setBFileB}
            onProblem={setProblem}
            testid="b-b"
          />
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Leave out quiet stretches</span>
            <select
              className="block rounded border border-line bg-transparent px-2 py-1"
              value={quiet}
              onChange={(e) => setQuiet(e.target.value)}
              data-testid="quiet"
            >
              <option value="never">Keep everything</option>
              <option value="180">Only long breaks (3 minutes or more)</option>
              <option value="90">
                Intermissions and long breaks (90 seconds or more)
              </option>
              <option value="30">
                Most dead time between plays (30 seconds or more)
              </option>
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || ffmpegMissing || bFileA === "" || bFileB === ""}
            onClick={() =>
              void startPlan({
                mode: "broadcast",
                fileA: bFileA,
                fileB: bFileB,
                quietCutSeconds: quiet === "never" ? null : Number(quiet),
              })
            }
            data-testid="plan-broadcast"
          >
            Show me what it picks
          </button>
          <p className="text-xs text-muted">
            This reads both videos, which takes a while for two long games. It makes no
            video yet.
          </p>
        </section>
      ) : (
        <section className="card space-y-4" data-testid="panel-times">
          <p className="text-sm text-muted">
            Type the times of the moments you want, one per line, on the FIRST
            video&apos;s clock, like <code>12:34 big hit</code>. Each becomes a short
            clip. With a second video, each clip uses the camera nearer that moment.
          </p>
          <FileChoice
            label="First video"
            purpose="video-a"
            value={tFileA}
            onChange={setTFileA}
            onProblem={setProblem}
            testid="t-a"
          />
          <FileChoice
            label="Second video"
            purpose="video-b"
            value={tFileB}
            onChange={setTFileB}
            onProblem={setProblem}
            optional
            testid="t-b"
          />
          <label className="block space-y-1 text-sm">
            <span className="font-semibold">Times</span>
            <textarea
              className="block h-40 w-full rounded border border-line bg-transparent p-2 font-mono text-sm"
              placeholder={"12:34 big hit\n41:02 goal\n1:02:15 breakaway"}
              value={timesText}
              onChange={(e) => setTimesText(e.target.value)}
              data-testid="times"
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label>
              Seconds before each time{" "}
              <input
                type="number"
                min={0}
                max={120}
                className="ml-1 w-16 rounded border border-line bg-transparent px-2 py-1"
                value={before}
                onChange={(e) => setBefore(Number(e.target.value))}
              />
            </label>
            <label>
              Seconds after{" "}
              <input
                type="number"
                min={0}
                max={120}
                className="ml-1 w-16 rounded border border-line bg-transparent px-2 py-1"
                value={after}
                onChange={(e) => setAfter(Number(e.target.value))}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || ffmpegMissing || tFileA === "" || timesText.trim() === ""}
            onClick={() =>
              void startPlan({
                mode: "times",
                fileA: tFileA,
                fileB: tFileB === "" ? null : tFileB,
                timesText,
                beforeSeconds: before,
                afterSeconds: after,
              })
            }
            data-testid="plan-times"
          >
            Show me the clips
          </button>
        </section>
      )}

      {plan !== null && plan.mode === tab ? (
        <section className="card space-y-4" data-testid="plan">
          <h2 className="text-lg font-semibold">What it picked</h2>
          {plan.mode === "broadcast" ? (
            <p className="text-sm" data-testid="plan-summary">
              {clock(plan.keptSeconds)} kept of a {clock(plan.gameSeconds)} recording,
              in {plan.rows.length} pieces with {plan.switches} camera switches.
            </p>
          ) : (
            <p className="text-sm" data-testid="plan-summary">
              {plan.rows.length} {plan.rows.length === 1 ? "clip" : "clips"},{" "}
              {clock(plan.keptSeconds)} in all.
            </p>
          )}
          {plan.offsetSeconds !== null ? (
            <p className="text-xs text-muted">
              The second video started {plan.offsetSeconds.toFixed(1)} seconds after the
              first
              {plan.confidence !== null
                ? ` (sureness ${plan.confidence.toFixed(2)} out of 1; only a rough guide)`
                : ""}
              .
            </p>
          ) : null}
          {plan.notes.map((n) => (
            <p key={n} className="text-sm text-estimate" data-testid="plan-note">
              {n}
            </p>
          ))}
          {plan.problems.length > 0 ? (
            <div className="text-sm text-estimate" data-testid="plan-problems">
              <p className="font-semibold">
                These lines could not be read, so they are not in the video:
              </p>
              <ul className="list-disc pl-5">
                {plan.problems.map((p) => (
                  <li key={p.line}>
                    Line {p.line}: “{p.text}”. {p.why}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.skipped.length > 0 ? (
            <div className="text-sm text-estimate" data-testid="plan-skipped">
              <p className="font-semibold">These times were not used:</p>
              <ul className="list-disc pl-5">
                {plan.skipped.map((s, i) => (
                  <li key={`${s.line}-${i}`}>
                    {s.line > 0 ? `Line ${s.line}: ` : ""}
                    {clock(s.seconds)}. {s.why}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <table className="w-full text-left text-sm" data-testid="plan-rows">
            <thead className="text-muted">
              <tr>
                <th className="py-1">#</th>
                <th>From</th>
                <th>To</th>
                <th>Length</th>
                <th>Camera</th>
                {showNames ? <th>Name</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.n} className="border-t border-line">
                  <td className="py-1">{r.n}</td>
                  <td>{clock(r.startSeconds)}</td>
                  <td>{clock(r.endSeconds)}</td>
                  <td>{Math.round(r.lengthSeconds)} s</td>
                  <td>{r.camera === "A" ? "First video" : "Second video"}</td>
                  {showNames ? <td>{r.label}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {plan.rows.length > 15 ? (
            <button
              type="button"
              className="text-xs underline text-muted"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show fewer" : `Show all ${plan.rows.length}`}
            </button>
          ) : null}
          {plan.mode === "broadcast" ? (
            <div className="space-y-3 border-t border-line pt-4" data-testid="include">
              <h3 className="text-sm font-semibold">
                Moments you want to be sure of (optional)
              </h3>
              <p className="text-xs text-muted">
                Missed a hit or a goal? Type its time and Game Cut puts that moment in,
                from the camera nearer to it, without looking at the videos again. Then
                make the video again.
              </p>
              <textarea
                className="block h-20 w-full rounded border border-line bg-transparent p-2 font-mono text-sm"
                placeholder={"53:25 big hit"}
                value={incText}
                onChange={(e) => setIncText(e.target.value)}
                data-testid="include-times"
              />
              <label className="block space-y-1 text-sm">
                <span className="font-semibold">Those times were read from</span>
                <select
                  className="block rounded border border-line bg-transparent px-2 py-1"
                  value={incClock}
                  onChange={(e) =>
                    setIncClock(e.target.value as "first" | "second" | "finished")
                  }
                  data-testid="include-clock"
                >
                  <option value="first">The first video (its own player clock)</option>
                  <option value="second">
                    The second video (its own player clock)
                  </option>
                  <option value="finished">
                    The finished video I made, played from its start
                  </option>
                </select>
              </label>
              <div className="flex flex-wrap gap-4 text-sm">
                <label>
                  Seconds before{" "}
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className="ml-1 w-16 rounded border border-line bg-transparent px-2 py-1"
                    value={incBefore}
                    onChange={(e) => setIncBefore(Number(e.target.value))}
                  />
                </label>
                <label>
                  Seconds after{" "}
                  <input
                    type="number"
                    min={0}
                    max={120}
                    className="ml-1 w-16 rounded border border-line bg-transparent px-2 py-1"
                    value={incAfter}
                    onChange={(e) => setIncAfter(Number(e.target.value))}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy || ffmpegMissing || incText.trim() === ""}
                onClick={() => void addMoments()}
                data-testid="include-add"
              >
                Add these moments to the plan
              </button>
            </div>
          ) : null}
          <div className="space-y-2 border-t border-line pt-4">
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">Quality</span>
              <select
                className="block rounded border border-line bg-transparent px-2 py-1"
                value={quality}
                onChange={(e) => setQuality(e.target.value as Quality)}
                data-testid="quality"
              >
                <option value="draft">
                  Draft: smaller picture, much quicker. Check it first.
                </option>
                <option value="full">
                  Full: 1080p, the real thing. Takes much longer.
                </option>
              </select>
            </label>
            <p className="text-xs text-muted">
              About {sizeText(estimateBytes(plan.keptSeconds, quality))} for{" "}
              {clock(plan.keptSeconds)} of video. You choose where to save it next.
            </p>
            <input
              type="text"
              className="block w-full rounded border border-line bg-transparent px-2 py-1 font-mono text-xs"
              placeholder="Save as (optional): leave empty to choose in a window, or paste a path like D:\Hockey Videos\Game.mp4"
              value={outPath}
              onChange={(e) => setOutPath(e.target.value)}
              aria-label="Where to save the finished video"
              data-testid="out-path"
            />
            <button
              type="button"
              className="btn-primary"
              disabled={busy || ffmpegMissing || plan.rows.length === 0}
              onClick={() => void startMake()}
              data-testid="make"
            >
              Make the video…
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
