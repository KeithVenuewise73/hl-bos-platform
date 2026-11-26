"use client";

import { useEffect, useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";
import type { NeedChoice } from "@/app/api/review/route.ts";
import { GameChoice } from "@/components/GameChoice.tsx";
import { dayStatus, resultLines } from "@/lib/review-messages.ts";
import { refreshReviewDays, useReviewDays } from "@/lib/review-days.ts";
import { sendDay, type GameAnswer } from "@/lib/send-day.ts";

type Status = { configured: boolean; connected: boolean } | null;
type State =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly line: string }
  | { readonly kind: "choose"; readonly need: NeedChoice }
  | { readonly kind: "done"; readonly lines: string[] }
  | { readonly kind: "error"; readonly message: string };

/**
 * "Send for review" on a date card: sends that date's photos to the website's
 * private review area, where the owner checks quality and game labels and
 * approves them before anything is public. Says plainly when the website is not
 * set up or this computer is not connected: it never pretends to send.
 */
export function CardReview({
  day,
  photos,
  clips,
  copy,
}: {
  day: string;
  photos: number;
  clips: number;
  copy: CopyState;
}) {
  const onSite = useReviewDays();
  const [status, setStatus] = useState<Status>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    void fetch("/api/review")
      .then((r) => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  async function connect() {
    setState({ kind: "working", line: "Connecting this computer…" });
    const res = await fetch("/api/review/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    const out = (await res?.json().catch(() => ({}))) as {
      error?: string;
      connected?: boolean;
    };
    if (out?.connected === true) {
      setStatus({ configured: true, connected: true });
      setState({ kind: "idle" });
    } else {
      setState({ kind: "error", message: out?.error ?? "Could not connect." });
    }
  }

  async function send(answer?: GameAnswer) {
    setState({ kind: "working", line: "Starting…" });
    const out = await sendDay(
      day,
      copy.names[day] ?? "",
      (line) => setState({ kind: "working", line }),
      undefined,
      answer,
    );
    if (out.kind === "done") {
      setState({ kind: "done", lines: resultLines(out.result) });
      void refreshReviewDays();
    } else if (out.kind === "choose") {
      setState({ kind: "choose", need: out.need });
    } else {
      setState({ kind: "error", message: out.message });
    }
  }

  const working = state.kind === "working";
  const here = onSite?.[day];
  const badge =
    onSite === null
      ? null
      : dayStatus(
          photos,
          here?.photos ?? 0,
          here?.approved ?? 0,
          clips,
          here?.clips ?? 0,
        );
  return (
    <div className="space-y-1 text-xs" data-testid="card-review">
      {badge !== null && status?.configured === true && status.connected ? (
        <p
          data-testid="site-status"
          data-state={badge.kind}
          className={
            badge.kind === "all"
              ? "font-semibold text-brand"
              : badge.kind === "partial"
                ? "font-semibold text-estimate"
                : "text-muted"
          }
        >
          {badge.kind === "all" ? "✓ " : ""}
          {badge.text}
        </p>
      ) : null}
      {status !== null && !status.configured ? (
        <>
          <button
            type="button"
            className="btn-ghost w-full"
            disabled
            data-testid="send-review"
          >
            Send for review
          </button>
          <p className="text-muted" data-testid="review-unavailable">
            Not available yet: the website&apos;s review area has not been switched on.
          </p>
        </>
      ) : status !== null && !status.connected ? (
        <>
          <button
            type="button"
            className="btn-ghost w-full"
            data-testid="connect-review"
            disabled={working}
            onClick={() => void connect()}
          >
            Connect this computer to the website
          </button>
          <p className="text-muted">Needed once, before the first send.</p>
        </>
      ) : (
        <button
          type="button"
          className="btn-ghost w-full"
          data-testid="send-review"
          disabled={working || copy.running !== null || status === null}
          onClick={() => void send()}
        >
          {working ? state.line : "Send for review"}
        </button>
      )}
      {state.kind === "working" && status?.configured !== true ? (
        <p className="text-muted">{state.line}</p>
      ) : null}
      {state.kind === "choose" ? (
        <GameChoice need={state.need} onAnswer={(a) => void send(a)} />
      ) : null}
      {state.kind === "done" ? (
        <div className="space-y-1" data-testid="review-result">
          {state.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      ) : null}
      {state.kind === "error" ? (
        <p className="text-bad" data-testid="review-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
