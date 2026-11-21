"use client";

import { useRef, useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";
import type { FreeCardLine } from "@/app/api/free-card/route.ts";
import {
  bytesWords,
  checkedLine,
  files,
  freedLines,
  type KeptGroup,
} from "@/lib/free-card-messages.ts";
import type { ScanView } from "@/lib/scan-view.ts";

type Checked = Extract<FreeCardLine, { type: "checked" }>;
type State =
  | { readonly kind: "idle" }
  | { readonly kind: "working"; readonly what: string }
  | { readonly kind: "checked"; readonly c: Checked }
  | { readonly kind: "confirm"; readonly c: Checked }
  | {
      readonly kind: "freed";
      readonly lines: string[];
      readonly kept: KeptGroup[];
    }
  | { readonly kind: "error"; readonly message: string };

/** Reads the route's lines of JSON; returns the last meaningful one. */
async function run(
  body: Record<string, unknown>,
  onProgress: (line: string) => void,
  signal: AbortSignal,
): Promise<FreeCardLine> {
  const res = await fetch("/api/free-card", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || res.body === null) {
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    return { type: "error", message: out.error ?? "Could not start." };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let last: FreeCardLine | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffered.indexOf("\n")) !== -1) {
      const line = buffered.slice(0, nl);
      buffered = buffered.slice(nl + 1);
      if (line.trim() === "") continue;
      const m = JSON.parse(line) as FreeCardLine;
      if (m.type === "progress")
        onProgress(
          `${m.phase === "checking" ? "Checking" : "Deleting"} ${m.done.toLocaleString("en-US")} of ${m.total.toLocaleString("en-US")}…`,
        );
      else last = m;
    }
  }
  return (
    last ?? {
      type: "error",
      message: "DateSort stopped answering. Nothing further was deleted.",
    }
  );
}

/**
 * "Free up the card": after the photos are on the hard drive AND on 5Star,
 * delete the originals from the card, but only the ones proven (by their
 * bytes) to be safe, and only after the person has seen the numbers and
 * confirmed. The card has no Recycle Bin, so this says so plainly.
 */
export function FreeCardPanel({ view, copy }: { view: ScanView; copy: CopyState }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const destination = copy.destination.trim();
  if (destination === "") return null;
  const working = state.kind === "working";
  const blocked = working || copy.running !== null;

  async function check() {
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ kind: "working", what: "Checking…" });
    try {
      const out = await run(
        { step: "check", scanId: view.scanId, destination },
        (what) => setState({ kind: "working", what }),
        ctl.signal,
      );
      if (out.type === "checked") setState({ kind: "checked", c: out });
      else if (out.type === "error") setState({ kind: "error", message: out.message });
    } catch {
      setState({
        kind: "error",
        message: "DateSort did not answer. Is its window still open?",
      });
    }
  }

  async function free(c: Checked) {
    const ctl = new AbortController();
    abort.current = ctl;
    setState({ kind: "working", what: "Deleting…" });
    try {
      const out = await run(
        { step: "delete", checkId: c.checkId, confirm: "DELETE" },
        (what) => setState({ kind: "working", what }),
        ctl.signal,
      );
      if (out.type === "freed")
        setState({
          kind: "freed",
          lines: freedLines(
            out.removed,
            out.bytesFreed,
            out.keptCount - out.failedCount,
            out.failedCount,
            out.stopped,
          ),
          kept: out.kept,
        });
      else if (out.type === "error") setState({ kind: "error", message: out.message });
    } catch {
      setState({ kind: "error", message: "Stopped. Nothing further was deleted." });
    }
  }

  const keptList = (kept: readonly KeptGroup[]) =>
    kept.length === 0 ? null : (
      <ul className="space-y-1 text-sm" data-testid="free-kept">
        {kept.map((g) => (
          <li key={g.reason}>
            <b>{files(g.count)}</b> stay on the card: {g.words}
            <span className="text-muted">
              {" "}
              ({g.examples.join(", ")}
              {g.count > g.examples.length ? ", …" : ""})
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <section className="card space-y-3 p-5" data-testid="free-card">
      <h2 className="text-lg font-semibold">Free up the card</h2>
      <p className="text-sm text-muted">
        Deletes photos and videos from the card <b>only</b> when an identical copy is on
        your hard drive and (for photos) the photo is already on 5Star. Each file is
        checked by its contents, not its name. Nothing is deleted until you have seen
        the numbers and confirmed.
      </p>

      {state.kind === "idle" || state.kind === "error" || state.kind === "freed" ? (
        <button
          type="button"
          className="btn"
          data-testid="free-check"
          disabled={blocked}
          onClick={() => void check()}
        >
          Check what can be deleted from the card
        </button>
      ) : null}

      {working ? (
        <div
          className="flex flex-wrap items-center gap-3 text-sm"
          data-testid="free-working"
        >
          <span>{state.what}</span>
          <button
            type="button"
            className="btn-ghost"
            data-testid="free-stop"
            onClick={() => abort.current?.abort()}
          >
            Stop
          </button>
        </div>
      ) : null}

      {state.kind === "checked" || state.kind === "confirm" ? (
        <div className="space-y-3" data-testid="free-checked">
          <p className="text-sm" data-testid="free-summary">
            {checkedLine(state.c.safe, state.c.videos, state.c.bytes)}
          </p>
          {keptList(state.c.kept)}
          {state.c.keptCount > 0 ? (
            <p className="text-xs text-muted">
              Those stay on the card. Copy them to the hard drive and send them for
              review, then check again.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.kind === "checked" && state.c.safe > 0 ? (
        <button
          type="button"
          className="btn-ghost text-bad"
          data-testid="free-delete"
          disabled={blocked}
          onClick={() => setState({ kind: "confirm", c: state.c })}
        >
          Delete {files(state.c.safe)} from the card…
        </button>
      ) : null}

      {state.kind === "confirm" ? (
        <div
          className="space-y-2 rounded border border-bad p-3 text-sm"
          role="alertdialog"
          aria-label="Confirm deleting from the card"
          data-testid="free-confirm"
        >
          <p>
            <b>
              Permanently delete {files(state.c.safe)} ({bytesWords(state.c.bytes)})
              from the card?
            </b>
          </p>
          <p>
            A memory card has no Recycle Bin: they cannot be brought back from the card.
            Their copies stay on your hard drive. Each one is checked again, one at a
            time, just before it is deleted, and anything that no longer matches is
            kept.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn text-bad"
              data-testid="free-confirm-yes"
              onClick={() => void free(state.c)}
            >
              Yes, delete them
            </button>
            <button
              type="button"
              className="btn-ghost"
              data-testid="free-confirm-no"
              onClick={() => setState({ kind: "checked", c: state.c })}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "freed" ? (
        <div className="space-y-2 text-sm" data-testid="free-result">
          {state.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {keptList(state.kept)}
          <p className="text-xs text-muted">
            A record of every file deleted is kept in DateSort&apos;s settings folder
            (freed-from-card.log).
          </p>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <p className="text-sm text-bad" data-testid="free-error">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
