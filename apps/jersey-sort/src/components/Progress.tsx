"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface P {
  total: number;
  done: number;
  queued: number;
  processing: number;
  failed: number;
  needsReview: number;
}

/**
 * "Analyzing Photos — 147 / 428 complete — 34%". Polls the server every two
 * seconds while anything is waiting, and refreshes the page once when the
 * batch finishes so galleries fill in. The work itself runs on the server;
 * leaving this page does not stop it.
 */
export function ProgressPanel({
  eventId,
  initial,
}: {
  eventId: string | null;
  initial: P;
}) {
  const [p, setP] = useState<P>(initial);
  const router = useRouter();
  const wasBusy = useRef(initial.queued + initial.processing > 0);
  const busy = p.queued + p.processing > 0;

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      const url =
        eventId === null
          ? "/api/progress"
          : `/api/progress?event=${encodeURIComponent(eventId)}`;
      fetch(url, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<P>) : null))
        .then((next) => {
          if (next === null) return;
          setP(next);
          if (next.queued + next.processing === 0 && wasBusy.current) {
            wasBusy.current = false;
            router.refresh();
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [busy, eventId, router]);

  if (p.total === 0 || (!busy && p.failed === 0)) return null;
  const pct = p.total === 0 ? 0 : Math.floor((p.done / p.total) * 100);
  return (
    <section className="card mb-5 p-4" aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-lg">
          {busy ? "Analyzing photos" : "Analysis finished"}
        </h2>
        <span className="text-sm text-muted">
          {p.done.toLocaleString()} / {p.total.toLocaleString()} complete · {pct}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-panel-2">
        <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {p.processing > 0 ? `${p.processing} analyzing now · ` : ""}
        {p.queued > 0 ? `${p.queued.toLocaleString()} waiting · ` : ""}
        {p.needsReview.toLocaleString()} need review
        {p.failed > 0 ? ` · ${p.failed} failed (retry from below)` : ""}. You can leave
        this page; analysis keeps going.
      </p>
    </section>
  );
}
