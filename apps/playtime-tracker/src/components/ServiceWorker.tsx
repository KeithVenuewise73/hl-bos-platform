"use client";

import { useEffect } from "react";

/**
 * Register the offline shell — only where it can actually do something.
 *
 * Inside the iOS and Android shells the assets are already on the device, and
 * at a file:// origin a service worker cannot be registered at all. Attempting
 * it there would throw on every launch for no benefit, so it is skipped.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.location.protocol.startsWith("http")) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app works without it; it just will not open offline from a cold
      // browser tab. Nothing recorded is affected either way.
    });
  }, []);
  return null;
}
