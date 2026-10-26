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
  /** A folder import from DateSort, while this server has one for the event. */
  importing?: {
    done: number;
    total: number;
    alreadyIn: number;
    failed: number;
    finished: boolean;
    reasons: string[];
  } | null;
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
  const arriving = p.importing != null && !p.importing.finished;
  const busy = p.queued + p.processing > 0 || arriving;

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

  const imp = p.importing ?? null;
  const importNote =
    imp === null ? null : (
      <p className="mt-1 text-sm" data-testid="import-progress">
        {imp.finished
          ? `All ${imp.total.toLocaleString()} photos from the folder are in`
          : `Bringing in photos from the folder: ${imp.done.toLocaleString()} of ${imp.total.toLocaleString()}`}
        {imp.alreadyIn > 0
          ? ` · ${imp.alreadyIn.toLocaleString()} were already here`
          : ""}
        {imp.failed > 0
          ? ` · ${imp.failed} could not be brought in (${imp.reasons.join("; ")})`
          : ""}
        .
      </p>
    );
  if (p.total === 0 && imp === null) return null;
  if (!busy && p.failed === 0 && imp === null) return null;
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
      {importNote}
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
