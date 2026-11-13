"use client";

import { useEffect, useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";
import type { ReviewLine } from "@/app/api/review/route.ts";
import { progressLine, resultLines } from "@/lib/review-messages.ts";

type Status = { configured: boolean; connected: boolean } | null;
type State =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly line: string }
  | { readonly kind: "done"; readonly lines: string[] }
  | { readonly kind: "error"; readonly message: string };

/**
 * "Send for review" on a date card: sends that date's photos to the website's
 * private review area, where the owner checks quality and game labels and
 * approves them before anything is public. Says plainly when the website is not
 * set up or this computer is not connected: it never pretends to send.
 */
export function CardReview({ day, copy }: { day: string; copy: CopyState }) {
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

  async function send() {
    setState({ kind: "working", line: "Starting…" });
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, eventName: copy.names[day] ?? "" }),
      });
      if (!res.ok || res.body === null) {
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        setState({ kind: "error", message: out.error ?? "Could not start sending." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffered = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffered.indexOf("\n")) !== -1) {
          const line = buffered.slice(0, nl);
          buffered = buffered.slice(nl + 1);
          if (line.trim() === "") continue;
          const m = JSON.parse(line) as ReviewLine;
          if (m.type === "progress")
            setState({ kind: "working", line: progressLine(m.progress) });
          else if (m.type === "done") {
            finished = true;
            setState({ kind: "done", lines: resultLines(m.result) });
          } else {
            finished = true;
            setState({ kind: "error", message: m.message });
          }
        }
      }
      if (!finished)
        setState({
          kind: "error",
          message:
            "DateSort stopped answering. Send again: what is already there is skipped.",
        });
    } catch {
      setState({
        kind: "error",
        message: "DateSort did not answer. Is its window still open?",
      });
    }
  }

  const working = state.kind === "working";
  return (
    <div className="space-y-1 text-xs" data-testid="card-review">
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
