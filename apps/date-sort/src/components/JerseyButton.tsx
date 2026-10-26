"use client";

import { useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * "Find jersey numbers" on a date card: hands the date's folder to
 * JerseySort (starting it if needed) and gives a link to the page where the
 * game becomes an event. Only for the games the CEO picks: nothing is read
 * until he confirms there.
 */
export function CardJersey({ day, copy }: { day: string; copy: CopyState }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function go() {
    setState({ kind: "starting" });
    try {
      const res = await fetch("/api/jersey-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, eventName: copy.names[day] ?? "" }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      setState(
        out.url !== undefined
          ? { kind: "ready", url: out.url }
          : { kind: "error", message: out.error ?? "JerseySort could not be opened." },
      );
    } catch {
      setState({
        kind: "error",
        message: "DateSort did not answer. Is its window still open?",
      });
    }
  }

  return (
    <div className="space-y-1 text-xs" data-testid="card-jersey">
      {state.kind === "ready" ? (
        <a
          className="btn-primary block w-full text-center"
          data-testid="open-jersey-sort"
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open this game in JerseySort ↗
        </a>
      ) : (
        <button
          type="button"
          className="btn-ghost w-full"
          data-testid="find-jersey-numbers"
          disabled={state.kind === "starting" || copy.running !== null}
          onClick={() => void go()}
        >
          {state.kind === "starting"
            ? "Starting JerseySort… (about a minute the first time)"
            : "Find jersey numbers"}
        </button>
      )}
      {state.kind === "error" ? (
        <p className="text-bad" data-testid="jersey-error">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
