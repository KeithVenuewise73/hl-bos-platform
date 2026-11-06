"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  guidedStatusAction,
  installBrowserAction,
  runVisualReviewAction,
  startGuidedReviewAction,
  stopGuidedReviewAction,
} from "@/actions/visual";
import type { PresenceResult } from "@/lib/presence";

import { button, C } from "./presence-style";

/**
 * Two ways to look at a website: the automatic review (the browser picks the
 * pages), or "view it yourself" (a visible window opens on this computer; you
 * browse; each page you land on is recorded). One click each; results in plain
 * English.
 */
export function VisualControls({
  id,
  browserReady,
}: {
  id: string;
  browserReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  const [live, setLive] = useState<{ pages: number } | null>(null);
  const form = () => {
    const fd = new FormData();
    fd.set("id", id);
    return fd;
  };
  const go = (
    fn: (fd: FormData) => Promise<PresenceResult>,
    after?: (r: PresenceResult) => void,
  ) =>
    start(async () => {
      const r = await fn(form());
      setResult(r);
      after?.(r);
    });

  // While a window is open, show how many pages it has recorded; refresh when it closes.
  const recording = live !== null;
  useEffect(() => {
    if (!recording) return;
    const fd = new FormData();
    fd.set("id", id);
    const t = setInterval(() => {
      void guidedStatusAction(fd).then((s) => {
        if (s.state === "running") setLive({ pages: s.pages });
        else {
          setLive(null);
          if (s.state === "finished") setResult(s.result);
          router.refresh();
        }
      });
    }, 2500);
    return () => clearInterval(t);
  }, [recording, id, router]);

  if (!browserReady)
    return (
      <div>
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
        <Result r={result} />
      </div>
    );
  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={pending || live !== null}
          style={button(true, pending || live !== null)}
          onClick={() =>
            go(startGuidedReviewAction, (r) => {
              if (r.ok) setLive({ pages: 0 });
            })
          }
        >
          View it yourself
        </button>
        <button
          type="button"
          disabled={pending || live !== null}
          style={button(false, pending || live !== null)}
          onClick={() => go(runVisualReviewAction)}
        >
          {pending && live === null
            ? "Viewing the website… (up to 3 minutes)"
            : "Run automatic review"}
        </button>
      </div>
      {live ? (
        <div role="status" style={{ marginTop: 10, fontSize: 13 }}>
          <strong style={{ color: C.green }}>
            Recording: {live.pages} page(s) so far.
          </strong>{" "}
          <span style={{ color: C.muted }}>
            Browse in the window that opened. Close it when you have seen enough,
            or{" "}
          </span>
          <button
            type="button"
            style={{ ...button(false, pending), padding: "2px 10px" }}
            disabled={pending}
            onClick={() =>
              go(stopGuidedReviewAction, () => {
                setLive(null);
                router.refresh();
              })
            }
          >
            Done
          </button>
        </div>
      ) : null}
      <Result r={result} />
    </div>
  );
}

function Result({ r }: { r: PresenceResult | null }) {
  if (!r) return null;
  return (
    <div role={r.ok ? "status" : "alert"} style={{ marginTop: 10, fontSize: 13 }}>
      <strong style={{ color: r.ok ? C.green : C.yellow }}>{r.headline}</strong>{" "}
      <span style={{ color: C.muted }}>{r.meaning}</span>
    </div>
  );
}
