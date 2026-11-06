"use client";

import { useState } from "react";

import type { CopyState } from "@/components/CopyPanel.tsx";

type State =
  | { readonly kind: "idle" }
  | { readonly kind: "starting" }
  | { readonly kind: "ready"; readonly url: string }
  | { readonly kind: "error"; readonly message: string };

const WORDS = {
  jersey: {
    button: "Find jersey numbers",
    open: "Open this game in JerseySort ↗",
    test: "find-jersey-numbers",
    openTest: "open-jersey-sort",
  },
  publish: {
    button: "Publish to 5 Star",
    open: "Choose the team gallery and publish ↗",
    test: "publish-5star",
    openTest: "open-publish",
  },
} as const;

/**
 * "Find jersey numbers" and "Publish to 5 Star" on a date card: hands the
 * date's folder to JerseySort (starting it if needed) and gives a link to the
 * page where the game becomes an event, or is published to
 * 5starsportsmedia.com. Only for the games the CEO picks: nothing is read
 * until he confirms there.
 */
export function CardJersey({
  day,
  copy,
  purpose = "jersey",
}: {
  day: string;
  copy: CopyState;
  purpose?: "jersey" | "publish";
}) {
  const words = WORDS[purpose];
  const [state, setState] = useState<State>({ kind: "idle" });

  async function go() {
    setState({ kind: "starting" });
    try {
      const res = await fetch("/api/jersey-sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, eventName: copy.names[day] ?? "", purpose }),
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
    <div
      className="space-y-1 text-xs"
      data-testid={purpose === "publish" ? "card-publish" : "card-jersey"}
    >
      {state.kind === "ready" ? (
        <a
          className="btn-primary block w-full text-center"
          data-testid={words.openTest}
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {words.open}
        </a>
      ) : (
        <button
          type="button"
          className="btn-ghost w-full"
          data-testid={words.test}
          disabled={state.kind === "starting" || copy.running !== null}
          onClick={() => void go()}
        >
          {state.kind === "starting"
            ? "Starting JerseySort… (about a minute the first time)"
            : words.button}
        </button>
      )}
      {state.kind === "error" ? (
        <p
          className="text-bad"
          data-testid={purpose === "publish" ? "publish-error" : "jersey-error"}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
