"use client";

import { useEffect, useRef, useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";
import { allDoneLines, resultLines, type AllTotals } from "@/lib/review-messages.ts";
import { refreshReviewDays, useReviewDays } from "@/lib/review-days.ts";
import type { NeedChoice } from "@/app/api/review/route.ts";
import { GameChoice } from "@/components/GameChoice.tsx";
import { sendDay, type GameAnswer, type SendKind } from "@/lib/send-day.ts";

type Status = { configured: boolean; connected: boolean } | null;

const EMPTY: AllTotals = {
  daysDone: 0,
  sent: 0,
  alreadyThere: 0,
  largeAdded: 0,
  failedPhotos: 0,
  clipsSent: 0,
  clipsAlreadyThere: 0,
  clipsNeedTool: 0,
  skippedDays: [],
  problemDays: [],
};

/**
 * "Send all for review": works through every shooting date in turn, one after the other,
 * so a big backlog goes to the website's private review area without pressing each date.
 * Photos the website already has are skipped, so it is safe to run again and to stop any
 * time. Dates whose folder is not ready are passed by and listed at the end. Nothing sent
 * is public: it all waits for the owner's approval.
 */
export function SendAllReview({
  days,
  copy,
}: {
  days: { day: string; photos: number; clips: number }[];
  copy: CopyState;
}) {
  const onSite = useReviewDays();
  const [status, setStatus] = useState<Status>(null);
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState("");
  const [totals, setTotals] = useState<AllTotals>(EMPTY);
  const [finished, setFinished] = useState<{ lines: string[] } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  // Dates whose name matches none of the website's games for that day: held, never sent until answered.
  const [asking, setAsking] = useState<NeedChoice[]>([]);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void fetch("/api/review")
      .then((r) => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  // Only when the website is switched on and this computer is connected: the card
  // buttons explain how to get there.
  if (status === null || !status.configured || !status.connected) return null;

  async function run() {
    const ctl = new AbortController();
    abort.current = ctl;
    setRunning(true);
    setFinished(null);
    setFatal(null);
    setAsking([]);
    setAnswered({});
    let t: AllTotals = EMPTY;
    setTotals(t);
    const ordered = days.map((d) => d.day).sort(); // oldest first
    let stopped = false;
    for (const [i, day] of ordered.entries()) {
      if (ctl.signal.aborted) {
        stopped = true;
        break;
      }
      const prefix = `Date ${i + 1} of ${ordered.length} (${day}): `;
      setLine(`${prefix}starting…`);
      const out = await sendDay(
        day,
        copy.names[day] ?? "",
        (l) => setLine(prefix + l),
        ctl.signal,
      );
      if (out.kind === "done") {
        const r = out.result;
        t = {
          ...t,
          daysDone: t.daysDone + 1,
          sent: t.sent + r.sent,
          alreadyThere: t.alreadyThere + r.alreadyThere,
          largeAdded: t.largeAdded + r.largeAdded,
          failedPhotos: t.failedPhotos + r.failed.length,
          failedReasons: [...(t.failedReasons ?? []), ...r.failed.map((f) => f.reason)],
          clipsSent: t.clipsSent + r.clipsSent,
          clipsAlreadyThere: t.clipsAlreadyThere + r.clipsAlreadyThere,
          clipsNeedTool: t.clipsNeedTool + r.videosNotSent,
        };
      } else if (out.kind === "choose") {
        setAsking((a) => [...a, out.need]);
      } else if (out.kind === "skip") {
        t = { ...t, skippedDays: [...t.skippedDays, { day, reason: out.message }] };
      } else if (out.message === "Stopped.") {
        stopped = true;
        setTotals(t);
        break;
      } else if (
        /not connected|not switched on|already being sent/i.test(out.message)
      ) {
        // Nothing will work for the dates that follow either: say why and stop.
        setFatal(out.message);
        stopped = true;
        setTotals(t);
        break;
      } else {
        t = { ...t, problemDays: [...t.problemDays, { day, reason: out.message }] };
      }
      setTotals(t);
    }
    abort.current = null;
    setRunning(false);
    setLine("");
    void refreshReviewDays();
    setFinished({
      lines: allDoneLines(
        t,
        stopped,
        days.reduce((n, d) => n + d.clips, 0),
      ),
    });
  }

  async function answer(need: NeedChoice, a: GameAnswer, only: SendKind) {
    setAnswering(need.day);
    const out = await sendDay(
      need.day,
      copy.names[need.day] ?? "",
      () => undefined,
      undefined,
      a,
      only,
    );
    setAnswering(null);
    setAnswered((m) => ({
      ...m,
      [need.day]:
        out.kind === "done"
          ? `${need.day}: sent. ${resultLines(out.result).join(" ")}`
          : `${need.day}: ${out.kind === "choose" ? out.need.error : out.message}`,
    }));
    void refreshReviewDays();
  }

  return (
    <section className="card space-y-3 p-5" data-testid="send-all">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Send everything for review</h2>
          <p className="text-sm text-muted">
            Sends every shooting date below to the website&apos;s private review area,
            one after the other. Photos already there are skipped, so you can stop and
            run it again any time. Nothing is public until you approve it.
          </p>
        </div>
        {running ? (
          <button
            type="button"
            className="btn-ghost"
            data-testid="send-all-stop"
            onClick={() => abort.current?.abort()}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            data-testid="send-all-button"
            disabled={copy.running !== null || days.length === 0}
            onClick={() => void run()}
          >
            Send all {days.length.toLocaleString("en-US")} dates for review
          </button>
        )}
      </div>
      {onSite !== null ? (
        <p className="text-sm text-muted" data-testid="send-all-summary">
          {(() => {
            const complete = days.filter(
              (d) =>
                (onSite[d.day]?.photos ?? 0) >= d.photos &&
                (onSite[d.day]?.clips ?? 0) >= d.clips,
            ).length;
            return `${complete.toLocaleString("en-US")} of ${days.length.toLocaleString("en-US")} dates are fully on 5Star.`;
          })()}
        </p>
      ) : null}
      {running ? (
        <div className="space-y-1 text-sm" data-testid="send-all-progress">
          <p>{line}</p>
          <p className="text-muted">
            So far: {totals.daysDone.toLocaleString("en-US")} dates done,{" "}
            {totals.sent.toLocaleString("en-US")} photos sent,{" "}
            {totals.alreadyThere.toLocaleString("en-US")} already there. Keep this
            window open and the computer on.
          </p>
        </div>
      ) : null}
      {fatal !== null ? (
        <p className="text-sm text-bad" data-testid="send-all-error">
          {fatal}
        </p>
      ) : null}
      {asking.length > 0 ? (
        <div className="space-y-3 text-sm" data-testid="send-all-asking">
          <p className="font-semibold">
            {asking.length === 1
              ? "1 date was held back until you say which game it joins."
              : `${asking.length} dates were held back until you say which game each joins.`}{" "}
            Nothing was sent for {asking.length === 1 ? "it" : "them"}.
          </p>
          {asking.map((need) =>
            answered[need.day] !== undefined ? (
              <p key={need.day} data-testid="send-all-answered">
                {answered[need.day]}
              </p>
            ) : (
              <GameChoice
                key={need.day}
                need={need}
                disabled={answering !== null}
                onAnswer={(a, only) => void answer(need, a, only)}
              />
            ),
          )}
        </div>
      ) : null}
      {finished !== null ? (
        <div className="space-y-1 text-sm" data-testid="send-all-result">
          {finished.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
