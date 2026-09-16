"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { getVersion, subscribe } from "./store";

/**
 * Re-render when the local store changes.
 *
 * The store's change counter is what React subscribes to, NOT the value: every
 * selector in store.ts builds a fresh array or object, and a snapshot that is
 * never identical to the previous one sends useSyncExternalStore into an
 * infinite render loop. Subscribing to a number and then reading during render
 * gives fresh data on every paint and a stable snapshot for React.
 */
export function useStore<T>(read: () => T): T {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return read();
}

/**
 * A ticking clock -- FOR RENDERING ONLY.
 *
 * This interval decides how often the screen is repainted. It has nothing to
 * do with how long anyone has played: every duration in this app is computed
 * by the engine from recorded timestamps. If this timer is throttled to a stop
 * by a locked screen, or never fires because the app was suspended, not one
 * second of anyone's playing time is affected -- the next paint just shows the
 * correct, larger number.
 *
 * It also refreshes the moment the app becomes visible again, so a coach
 * returning from the camera sees the true clock immediately rather than after
 * the next tick.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const id = setInterval(update, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", update);
    };
  }, [intervalMs]);

  return now;
}

/** Whether the device currently believes it has a network. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/**
 * Read a query-string parameter.
 *
 * A static export has no dynamic route segments, so records are addressed as
 * `/game/?id=…` rather than `/game/[id]`. This must track the LIVE value:
 * reading window.location once on mount looked right until a navigation
 * changed only the query, at which point the screen kept rendering the
 * previous record.
 *
 * useSearchParams is empty during prerender, which is why every screen that
 * calls this sits behind a <Suspense> boundary.
 */
export function useQueryParam(name: string): string | null {
  return useSearchParams().get(name);
}

/** True once the component has mounted on the device. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
