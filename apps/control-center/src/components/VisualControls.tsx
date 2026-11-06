"use client";

import { useState, useTransition } from "react";

import { installBrowserAction, runVisualReviewAction } from "@/actions/visual";
import type { PresenceResult } from "@/lib/presence";

import { button, C } from "./presence-style";

/** Run a visual review, or install the browser first. One click each; the result in plain English. */
export function VisualControls({
  id,
  browserReady,
}: {
  id: string;
  browserReady: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  const go = (fn: (fd: FormData) => Promise<PresenceResult>) =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      setResult(await fn(fd));
    });
  return (
    <div>
      {browserReady ? (
        <button
          type="button"
          disabled={pending}
          style={button(true, pending)}
          onClick={() => go(runVisualReviewAction)}
        >
          {pending ? "Viewing the website… (up to 3 minutes)" : "Run visual review"}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          style={button(true, pending)}
          onClick={() => go(installBrowserAction)}
        >
          {pending
            ? "Installing the browser… (a few minutes, once)"
            : "Install the browser (once, about 150 MB)"}
        </button>
      )}
      {result ? (
        <div
          role={result.ok ? "status" : "alert"}
          style={{ marginTop: 10, fontSize: 13 }}
        >
          <strong style={{ color: result.ok ? C.green : C.yellow }}>
            {result.headline}
          </strong>{" "}
          <span style={{ color: C.muted }}>{result.meaning}</span>
        </div>
      ) : null}
    </div>
  );
}
