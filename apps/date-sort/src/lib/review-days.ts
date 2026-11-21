"use client";

import { useSyncExternalStore } from "react";

/** One date as the website holds it. */
export interface SiteDay {
  readonly photos: number;
  readonly approved: number;
}
type Snapshot = Record<string, SiteDay> | null;

let current: Snapshot = null; // null: not known (loading, or the website is unavailable)
let started = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Ask which dates are on the website. Safe to call again after a send. */
export async function refreshReviewDays(): Promise<void> {
  try {
    const r = await fetch("/api/review/status", { cache: "no-store" });
    const j = (await r.json()) as {
      available?: boolean;
      days?: Record<string, SiteDay>;
    };
    current = j.available === true && j.days ? j.days : null;
  } catch {
    current = null;
  }
  emit();
}

/** The dates on the website, or null when that is not known (nothing is shown then). */
export function useReviewDays(): Snapshot {
  const days = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (!started) {
        started = true;
        void refreshReviewDays();
      }
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  return days;
}
